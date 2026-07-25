const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pitDesktop", {
  checkForUpdates: () => ipcRenderer.invoke("pit:check-for-updates"),
  restartApplication: () => ipcRenderer.invoke("pit:restart-application"),
  getFullscreen: () => ipcRenderer.invoke("pit:get-fullscreen"),
  toggleFullscreen: () => ipcRenderer.invoke("pit:toggle-fullscreen"),
  onFullscreenChange: (callback) => {
    const listener = (_event, fullscreen) => callback(fullscreen);
    ipcRenderer.on("pit:fullscreen-changed", listener);
    return () => ipcRenderer.removeListener("pit:fullscreen-changed", listener);
  },
});
