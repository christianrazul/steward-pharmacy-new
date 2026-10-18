// Runs in the sandboxed renderer before the web UI. Exposes only typed calls
// into the main process; the web UI never gets Node.js or Electron APIs.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import type { DesktopBridge } from "@steward/data/local";

const bridge: DesktopBridge = {
  invoke: (method, args) => ipcRenderer.invoke("steward:invoke", method, args),
  deviceInfo: () => ipcRenderer.invoke("steward:device"),
  enroll: (serverUrl, code) => ipcRenderer.invoke("steward:enroll", serverUrl, code),
  print: (html) => ipcRenderer.invoke("steward:print", html),
  syncStatus: () => ipcRenderer.invoke("steward:sync-status"),
  onSyncStatus: (listener) => {
    const handler = (_event: IpcRendererEvent, status: Parameters<typeof listener>[0]) => {
      listener(status);
    };
    ipcRenderer.on("steward:sync-status", handler);
    return () => {
      ipcRenderer.off("steward:sync-status", handler);
    };
  },
};

contextBridge.exposeInMainWorld("stewardDesktop", bridge);
