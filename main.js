const { app, BrowserWindow, ipcMain, Tray, nativeImage, screen, dialog, globalShortcut, Notification, Menu } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');

let mainWindow;
let pythonProcess = null;
let tray = null;

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
}

app.whenReady().then(() => {
    pythonProcess = spawn('python', [path.join(__dirname, 'backend.py')], { detached: false });
    
    setTimeout(() => {
        createWindow();
        createTray();
        // Show once on startup so user knows it's there
        mainWindow.show();
        mainWindow.center(); // Center initially
    }, 1000);
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

// Explicit handlers
ipcMain.handle('window-minimize', () => mainWindow.hide());

ipcMain.handle('toggle-always-on-top', (event, isPinned) => {
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
});

ipcMain.on('register-shortcuts', (event, shortcutsMap) => {
    globalShortcut.unregisterAll();
    for (const [hotkey, toolId] of Object.entries(shortcutsMap)) {
        if (hotkey && hotkey.trim() !== '') {
            try {
                globalShortcut.register(hotkey, () => {
                    if (mainWindow) {
                        mainWindow.webContents.send('trigger-toggle', toolId);
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

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});
