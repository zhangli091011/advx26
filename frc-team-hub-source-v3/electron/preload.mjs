import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("pitDesktop", {
  checkForUpdates: () => ipcRenderer.invoke("pit:check-for-updates"),
});
