const { app, BrowserWindow, ipcMain, Tray, nativeImage, screen, dialog, globalShortcut, Notification } = require('electron');
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
    if (pythonProcess) {
        try { exec(`taskkill /pid ${pythonProcess.pid} /T /F`); } catch(e) {}
    }
    app.quit();
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

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});
