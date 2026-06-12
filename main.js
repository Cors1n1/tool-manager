const { app, BrowserWindow, ipcMain, Tray, nativeImage, screen, dialog, globalShortcut, Notification, Menu } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const puppeteer = require('puppeteer-core');
const chromePaths = require('chrome-paths');
const fs = require('fs');

// Silencia os alertas irritantes de segurança do Electron no console
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

console.log('App starting. Electron version:', process.versions.electron);

let mainWindow = null;
let pythonProcess = null;
let browserProcess = null;
let tray = null;
let spotifyDeviceId = null;
let isPinnedState = false;

function createTray() {
    const iconPath = path.join(__dirname, 'icon.ico');
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon);
    tray.setToolTip('Tool Manager');
    
    const initialMenu = Menu.buildFromTemplate([
        { label: 'Abrir Tool Manager', click: () => { mainWindow.show(); mainWindow.focus(); } },
        { type: 'separator' },
        { label: 'Sair', click: () => app.quit() }
    ]);
    tray.setContextMenu(initialMenu);
    
    tray.on('click', (event, bounds) => {
        toggleWindow(bounds);
    });
}

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
        fullscreenable: false,
        resizable: false,
        transparent: true,
        skipTaskbar: true,
        icon: path.join(__dirname, 'icon.ico'),
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
    });
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

app.whenReady().then(() => {
    pythonProcess = spawn('python', [path.join(__dirname, 'backend.py')], { detached: false, stdio: 'ignore' });
    
    setTimeout(() => {
        createWindow();
        createTray();
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
        icon: path.join(__dirname, 'icon.ico'),
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
    new Notification({ title, body, icon: path.join(__dirname, 'icon.ico') }).show();
});

ipcMain.on('update-app-hotkey', () => {
    if (mainWindow) {
        mainWindow.webContents.send('app-hotkey-changed');
    }
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
