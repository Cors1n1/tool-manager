const { app, BrowserWindow, ipcMain, Tray, nativeImage, screen, dialog, globalShortcut, Notification, Menu } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const puppeteer = require('puppeteer-core');
const chromePaths = require('chrome-paths');
const fs = require('fs');
const net = require('net');
const WindowSnapper = require('./window-snapper');

// --- TCP Broker for Window Snapping ---
const snapperClients = new Set();
const allBounds = {};

function broadcastSnapperMsg(msgObj) {
    const syncStr = JSON.stringify(msgObj) + '\n';
    for (const c of snapperClients) {
        try { c.write(syncStr); } catch (e) {}
    }
}

function areConnected(b1, b2) {
    if (!b1 || !b2) return false;
    const T = 5; // Strict touch threshold to prevent premature locking
    const xOverlap = (b1.x - T <= b2.x + b2.width) && (b1.x + b1.width + T >= b2.x);
    const yOverlap = (b1.y - T <= b2.y + b2.height) && (b1.y + b1.height + T >= b2.y);
    if (!xOverlap || !yOverlap) return false;
    
    const touchLeft = Math.abs(b1.x - (b2.x + b2.width)) <= T;
    const touchRight = Math.abs((b1.x + b1.width) - b2.x) <= T;
    const touchTop = Math.abs(b1.y - (b2.y + b2.height)) <= T;
    const touchBottom = Math.abs((b1.y + b1.height) - b2.y) <= T;
    
    return touchLeft || touchRight || touchTop || touchBottom;
}

function getConnectedGroup(startId) {
    const visited = new Set();
    const queue = [startId];
    visited.add(startId);
    
    while(queue.length > 0) {
        const current = queue.shift();
        const currentBounds = allBounds[current];
        if (!currentBounds) continue;
        
        for (const [id, bounds] of Object.entries(allBounds)) {
            if (!visited.has(id)) {
                if (areConnected(currentBounds, bounds)) {
                    visited.add(id);
                    queue.push(id);
                }
            }
        }
    }
    return Array.from(visited);
}

const snapperServer = net.createServer((socket) => {
    socket.setNoDelay(true);
    snapperClients.add(socket);
    
    // Immediately send current pin state upon connection
    try {
        socket.write(JSON.stringify({ type: 'pin-state', isPinned: isPinnedState }) + '\n');
    } catch(e) {}

    socket.on('data', (data) => {
        try {
            const msgs = data.toString().split('\n');
            msgs.forEach(msg => {
                if (!msg.trim()) return;
                const parsed = JSON.parse(msg);
                if (parsed.type === 'update') {
                    allBounds[parsed.id] = parsed.bounds;
                    broadcastSnapperMsg({ type: 'sync', bounds: allBounds });
                }
                else if (parsed.type === 'drag') {
                    const group = getConnectedGroup(parsed.id);
                    const masterBounds = allBounds[parsed.id];
                    
                    if (masterBounds && parsed.bounds) {
                        const dx = parsed.bounds.x - masterBounds.x;
                        const dy = parsed.bounds.y - masterBounds.y;
                        
                        if (dx !== 0 || dy !== 0) {
                            for (const id of group) {
                                if (allBounds[id]) {
                                    allBounds[id].x += dx;
                                    allBounds[id].y += dy;
                                    if (id !== parsed.id) {
                                        broadcastSnapperMsg({ type: 'force-move', id: id, bounds: allBounds[id] });
                                    }
                                }
                            }
                        }
                    }
                }
            });
        } catch (e) {}
    });
    socket.on('close', () => snapperClients.delete(socket));
    socket.on('error', () => snapperClients.delete(socket));
});
snapperServer.listen(15555, '127.0.0.1', () => {
    console.log('[Broker] Window Snapping Server running on 15555');
});
// --------------------------------------

// Silencia os alertas irritantes de segurança do Electron no console
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

console.log('App starting. Electron version:', process.versions.electron);



let mainWindow = null;
let pythonProcess = null;
let browserProcess = null;

let spotifyDeviceId = null;
let isPinnedState = false;
let tray = null;


const toggleWindow = (trayBounds) => {
    if (mainWindow.isVisible()) {
        mainWindow.hide();
    } else {
        mainWindow.show();
        mainWindow.focus();
    }
};

let isQuiting = false;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 320,
        height: 480,
        show: false,
        frame: false,
    skipTaskbar: true,
        fullscreenable: false,
        resizable: false,
        transparent: true,
        
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));

    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        console.log(`[Renderer] ${message} (at ${sourceId}:${line})`);
    });
    
    // Prevent the window from being destroyed when closed (e.g. Alt+F4 or taskbar close)
    mainWindow.on('close', function (event) {
        if (!isQuiting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('show', () => {
        mainWindow.setAlwaysOnTop(isPinnedState, 'screen-saver');
        const group = getConnectedGroup('tool_manager');
        for (const id of group) {
            if (id !== 'tool_manager') {
                broadcastSnapperMsg({ type: 'visibility', id: id, visible: true });
            }
        }
    });

    mainWindow.on('hide', () => {
        const group = getConnectedGroup('tool_manager');
        for (const id of group) {
            if (id !== 'tool_manager') {
                broadcastSnapperMsg({ type: 'visibility', id: id, visible: false });
            }
        }
    });

    // Init magnetic snapping
    new WindowSnapper(mainWindow, 'tool_manager');
}

async function launchHeadlessPlayer() {
    try {
        const executablePath = chromePaths.chrome || chromePaths.edge;
        if (!executablePath) {
            console.error('No Chrome or Edge found for headless player.');
            return;
        }
        
        console.log('Launching headless player with', executablePath);
        browserProcess = await puppeteer.launch({
            executablePath: executablePath,
            headless: 'new', // Use new headless to hide taskbar icon but keep full browser capabilities (DRM)
            ignoreDefaultArgs: ['--mute-audio'], // CRITICAL: Puppeteer mutes audio by default!
            args: [
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--autoplay-policy=no-user-gesture-required'
            ],
            defaultViewport: null
        });

        const page = await browserProcess.newPage();
        page.on('console', msg => console.log('Headless Chrome:', msg.text()));
        
        // Wait for backend to be up
        setTimeout(async () => {
            try {
                await page.goto('http://localhost:5555/spotify/headless_player');
                // Simulate a click to unlock AudioContext just in case
                await page.click('body');
            } catch(err) {
                console.error(err);
            }
        }, 3000);
        
    } catch (e) {
        console.error('Failed to launch headless player:', e);
    }
}


const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
                mainWindow.focus();
            }
        }
    });
}



app.whenReady().then(() => {
    try {
        const electron = require('electron');
        const Menu = electron.Menu;
        const Tray = electron.Tray;
        const nativeImage = electron.nativeImage;
        const iconPath = require('path').join(__dirname, 'icon.ico');
        const trayIcon = nativeImage.createFromPath(iconPath);
        global.myTray = new Tray(trayIcon);
        global.myTray.setToolTip('Tool Manager');
        const ctxMenu = Menu.buildFromTemplate([
            { label: 'Abrir', click: () => { if(typeof mainWindow !== 'undefined' && mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
            { type: 'separator' },
            { label: 'Sair', click: () => { app.quit(); process.exit(0); } }
        ]);
        global.myTray.setContextMenu(ctxMenu);
        global.myTray.on('click', () => {
            if (typeof mainWindow !== 'undefined' && mainWindow) {
                if (mainWindow.isVisible()) mainWindow.hide();
                else { mainWindow.show(); mainWindow.focus(); }
            }
        });
    } catch(e) { console.error('Tray error', e); }

    pythonProcess = spawn('python', [path.join(__dirname, 'backend.py')], { detached: false, stdio: 'ignore' });
    
    setTimeout(() => {
        createWindow();
        
        mainWindow.show();
        mainWindow.center();
    }, 1000);
    
    launchHeadlessPlayer();
});

// Do not quit when window is closed (hidden)
app.on('window-all-closed', (e) => {
    e.preventDefault();
});

// Dialog handlers
ipcMain.handle('dialog-open-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'Aplicativos/Atalhos', extensions: ['exe', 'lnk', 'bat', 'py'] },
            { name: 'Todos', extensions: ['*'] }
        ]
    });
    if (!result.canceled) return result.filePaths[0];
    return null;
});

ipcMain.handle('dialog-open-dir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (!result.canceled) return result.filePaths[0];
    return null;
});

// ENV handlers
ipcMain.handle('read-env', async () => {
    const envPath = path.join(__dirname, '.env');
    try {
        if (fs.existsSync(envPath)) {
            return fs.readFileSync(envPath, 'utf8');
        }
    } catch(e) {
        console.error('Error reading .env', e);
    }
    return '';
});

ipcMain.handle('save-env', async (event, content) => {
    const envPath = path.join(__dirname, '.env');
    try {
        fs.writeFileSync(envPath, content, 'utf8');
        return true;
    } catch(e) {
        console.error('Error writing .env', e);
        return false;
    }
});

let envEditorWindow = null;
ipcMain.on('open-env-editor', () => {
    if (envEditorWindow) {
        envEditorWindow.focus();
        return;
    }
    envEditorWindow = new BrowserWindow({
        width: 600,
        height: 500,
        title: 'Editor de Variáveis (.env)',
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });
    envEditorWindow.loadFile(path.join(__dirname, 'ui', 'env.html'));
    envEditorWindow.on('closed', () => {
        envEditorWindow = null;
    });
});

// Explicit handlers
ipcMain.handle('window-minimize', () => mainWindow.hide());

ipcMain.handle('toggle-always-on-top', (event, isPinned) => {
    isPinnedState = isPinned;
    if (mainWindow) {
        mainWindow.setAlwaysOnTop(isPinned, 'screen-saver');
    }
    broadcastSnapperMsg({ type: 'pin-state', isPinned: isPinned });
});

ipcMain.handle('app-quit', () => {
    isQuiting = true;
    app.quit();
});

app.on('will-quit', () => {
    if (pythonProcess) {
        try { exec(`taskkill /pid ${pythonProcess.pid} /T /F`); } catch(e) {}
    }
    if (browserProcess) {
        try { browserProcess.close(); } catch(e) {}
    }
});

ipcMain.on('register-shortcuts', (event, shortcutsMap) => {
    globalShortcut.unregisterAll();
    for (const [hotkey, toolId] of Object.entries(shortcutsMap)) {
        if (hotkey && hotkey.trim() !== '') {
            try {
                globalShortcut.register(hotkey, () => {
                    if (mainWindow) {
                        if (typeof toolId === 'object' && toolId.type === 'app') {
                            const bounds = tray ? tray.getBounds() : undefined;
                            toggleWindow(bounds);
                        } else {
                            mainWindow.webContents.send('trigger-toggle', toolId);
                        }
                    }
                });
            } catch (e) {
                console.error(`Failed to register shortcut ${hotkey}:`, e);
            }
        }
    }
});

ipcMain.handle('show-notification', (event, title, body) => {
    new Notification({ title, body, icon: path.join(__dirname, 'icon.png') }).show();
});

ipcMain.on('update-app-hotkey', () => {
    if (mainWindow) {
        mainWindow.webContents.send('app-hotkey-changed');
    }
});

const startupLnkPath = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Tool Manager.lnk');
const exePath = path.join(__dirname, 'ToolManager.exe');

ipcMain.handle('get-startup-state', () => {
    return fs.existsSync(startupLnkPath);
});

ipcMain.handle('toggle-startup-state', (event, state) => {
    const { shell } = require('electron');
    if (state) {
        shell.writeShortcutLink(startupLnkPath, 'create', {
            target: exePath,
            cwd: __dirname,
            description: 'Inicia o Tool Manager no boot'
        });
    } else {
        if (fs.existsSync(startupLnkPath)) {
            fs.unlinkSync(startupLnkPath);
        }
    }
    return true;
});

ipcMain.on('update-tray-tooltip', (event, cpu, ram) => {
    // console.log(`Received update-tray-tooltip: CPU ${cpu}%, RAM ${ram}%`);
    if (tray) {
        tray.setToolTip(`Tool Manager | CPU: ${cpu}% | RAM: ${ram}%`);
    }
});

ipcMain.on('update-tray-menu', (event, tools) => {
    if (!tray) return;

    let template = [];
    
    if (tools && tools.length > 0) {
        const hasRunning = tools.some(t => t.running);
        if (hasRunning) {
            template.push({
                label: '🛑 Parar Tudo',
                click: () => {
                    if (mainWindow) {
                        mainWindow.webContents.send('trigger-stop-all');
                    }
                }
            });
            template.push({ type: 'separator' });
        }

        tools.forEach(tool => {
            const statusIcon = tool.running ? '🟢' : '⭕';
            template.push({
                label: `${statusIcon} ${tool.name}`,
                click: () => {
                    if (mainWindow) {
                        mainWindow.webContents.send('trigger-toggle', tool.id);
                    }
                }
            });
        });
        template.push({ type: 'separator' });
    } else {
        template.push({ label: 'Nenhuma ferramenta', enabled: false });
        template.push({ type: 'separator' });
    }
    
    template.push({ label: 'Abrir Tool Manager', click: () => { mainWindow.show(); mainWindow.focus(); } });
    template.push({ label: 'Sair', click: () => { isQuiting = true; app.quit(); } });
    
    const contextMenu = Menu.buildFromTemplate(template);
    tray.setContextMenu(contextMenu);
});

// --- Spotify ---
ipcMain.on('spotify-open-auth', () => {
    let authWin = new BrowserWindow({
        width: 600,
        height: 800,
        autoHideMenuBar: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true }
    });
    authWin.loadURL('http://localhost:5555/spotify/login');
    authWin.webContents.on('did-navigate', (event, url) => {
        if (url.includes('spotify/callback') && url.includes('code=')) {
            setTimeout(() => {
                if (!authWin.isDestroyed()) authWin.close();
                if (mainWindow) mainWindow.webContents.send('spotify-auth-success');
            }, 1500);
        }
    });
});

ipcMain.on('spotify-open-browser', () => {
    let spWin = new BrowserWindow({
        width: 1100,
        height: 720,
        title: "Spotify Browser — Tool Manager",
        autoHideMenuBar: true,
        webPreferences: { 
            preload: path.join(__dirname, 'spotify-browser-preload.js'),
            nodeIntegration: false, 
            contextIsolation: true 
        }
    });
    spWin.setMenu(null);
    spWin.loadFile(path.join(__dirname, 'ui', 'spotify-browser.html'));
    // Pass the current device_id once the page is ready
    spWin.webContents.on('did-finish-load', () => {
        if (spotifyDeviceId) {
            spWin.webContents.send('set-device-id', spotifyDeviceId);
        }
    });
});

// Receive device_id from the Web Playback SDK in the renderer
ipcMain.on('spotify-device-ready', (event, deviceId) => {
    spotifyDeviceId = deviceId;
    console.log('[Spotify] Internal player device registered:', deviceId);
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});
