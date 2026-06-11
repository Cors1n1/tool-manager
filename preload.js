const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    minimize: () => ipcRenderer.invoke('window-minimize'),
    quit: () => ipcRenderer.invoke('app-quit'),
    openFileDialog: () => ipcRenderer.invoke('dialog-open-file'),
    openDirDialog: () => ipcRenderer.invoke('dialog-open-dir')
});
