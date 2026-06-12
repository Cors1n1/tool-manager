const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
    minimize: () => ipcRenderer.invoke('window-minimize'),
    quit: () => ipcRenderer.invoke('app-quit'),
    openFileDialog: () => ipcRenderer.invoke('dialog-open-file'),
    openDirDialog: () => ipcRenderer.invoke('dialog-open-dir'),
    toggleAlwaysOnTop: (isPinned) => ipcRenderer.invoke('toggle-always-on-top', isPinned),
    registerShortcuts: (map) => ipcRenderer.send('register-shortcuts', map),
    showNotification: (title, body) => ipcRenderer.invoke('show-notification', title, body),
    onTriggerToggle: (callback) => ipcRenderer.on('trigger-toggle', callback),
    onTriggerStopAll: (callback) => ipcRenderer.on('trigger-stop-all', callback),
    getPathForFile: (file) => webUtils.getPathForFile(file),
    updateTrayMenu: (tools) => ipcRenderer.send('update-tray-menu', tools),
    updateTrayTooltip: (cpu, ram) => ipcRenderer.send('update-tray-tooltip', cpu, ram),
    // Spotify
    spotifyOpenAuth: () => ipcRenderer.send('spotify-open-auth'),
    spotifyOpenBrowser: () => ipcRenderer.send('spotify-open-browser'),
    onSpotifyAuthSuccess: (callback) => ipcRenderer.on('spotify-auth-success', callback),
    notifyDeviceReady: (deviceId) => ipcRenderer.send('spotify-device-ready', deviceId),
    // ENV
    readEnv: () => ipcRenderer.invoke('read-env'),
    saveEnv: (content) => ipcRenderer.invoke('save-env', content),
    openEnvEditor: () => ipcRenderer.send('open-env-editor'),
    updateAppHotkey: () => ipcRenderer.send('update-app-hotkey'),
    onAppHotkeyChanged: (callback) => ipcRenderer.on('app-hotkey-changed', callback),
    getStartupState: () => ipcRenderer.invoke('get-startup-state'),
    toggleStartupState: (state) => ipcRenderer.invoke('toggle-startup-state', state)
});
