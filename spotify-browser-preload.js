const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // Receive the internal player device_id from the main process
    onSetDeviceId: (callback) => ipcRenderer.on('set-device-id', (event, deviceId) => callback(deviceId)),
});
