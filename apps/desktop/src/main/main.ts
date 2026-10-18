import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent, protocol, session } from "electron";
import electronUpdater from "electron-updater";

import { DesktopRuntime, toBridgeError } from "../core/runtime";
import { openLocalStore } from "../core/store";
import { APP_ORIGIN, serveApp } from "./protocol";
import { printSilently } from "./print";
import { safeTokenStore } from "./token-store";

const here = dirname(fileURLToPath(import.meta.url));
/** The web build and migrations ship as resources; in development they come from the repo. */
const resources = app.isPackaged ? process.resourcesPath : join(here, "../../..");
const WEB_ROOT = app.isPackaged ? join(resources, "web") : join(resources, "apps/web/out");
const MIGRATIONS = app.isPackaged
  ? join(resources, "migrations")
  : join(resources, "packages/db/drizzle");

// End-to-end tests run each launch in its own data folder. Never in an installed app.
if (!app.isPackaged && process.env.STEWARD_USER_DATA) {
  app.setPath("userData", process.env.STEWARD_USER_DATA);
}

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// One counter app per PC.
if (!app.requestSingleInstanceLock()) app.quit();

let mainWindow: BrowserWindow | null = null;

/**
 * Errors go to a log file in the app data folder for support. Only stack
 * traces: never passwords, tokens, GCash references or customer details.
 */
function logError(error: unknown) {
  const line = `${new Date().toISOString()} ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`;
  void appendFile(join(app.getPath("userData"), "main.log"), line).catch(() => undefined);
}

/** IPC is only accepted from our own pages. */
function fromApp(event: IpcMainInvokeEvent): boolean {
  return event.senderFrame?.url.startsWith(`${APP_ORIGIN}/`) === true;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: "Steward Pharmacy",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });
  win.once("ready-to-show", () => {
    win.show();
  });
  // No pop-ups, no navigation away from the app, no remote content.
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`${APP_ORIGIN}/`)) event.preventDefault();
  });
  void win.loadURL(`${APP_ORIGIN}/`);
  return win;
}

async function start() {
  await app.whenReady();
  const dataDir = join(app.getPath("userData"), "data");
  await mkdir(dataDir, { recursive: true });
  const store = await openLocalStore(join(dataDir, "pglite"), MIGRATIONS);
  const runtime = new DesktopRuntime(store.db, safeTokenStore(dataDir), {
    log: logError,
    onStatus: (status) => {
      mainWindow?.webContents.send("steward:sync-status", status);
    },
  });
  await runtime.init();

  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
  protocol.handle("app", (request) => serveApp(WEB_ROOT, request));

  ipcMain.handle("steward:invoke", (event, method: unknown, args: unknown) =>
    fromApp(event) ? runtime.invoke(method, args) : toBridgeError(new Error("Untrusted sender")),
  );
  ipcMain.handle("steward:device", (event) => (fromApp(event) ? runtime.deviceInfo() : null));
  ipcMain.handle("steward:enroll", (event, serverUrl: unknown, code: unknown) =>
    fromApp(event) ? runtime.enroll(serverUrl, code) : toBridgeError(new Error("Untrusted sender")),
  );
  ipcMain.handle("steward:sync-status", (event) => (fromApp(event) ? runtime.syncStatus() : null));
  ipcMain.handle("steward:print", async (event, html: unknown) => {
    if (!fromApp(event) || typeof html !== "string" || html.length > 200_000) {
      return toBridgeError(new Error("Untrusted print request"));
    }
    try {
      const info = await runtime.deviceInfo();
      await printSilently(html, info?.printWidth ?? 58);
      return { ok: true, value: null };
    } catch {
      return {
        ok: false,
        error: {
          code: "unknown",
          message:
            "The receipt didn’t print. Check that the printer is on and set as the Windows default.",
          fields: {},
        },
      };
    }
  });

  mainWindow = createWindow();
  app.on("second-instance", () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });
  app.on("window-all-closed", () => {
    void store.close().then(() => {
      app.quit();
    });
  });

  // Updates come from the Steward server's update feed (see docs/deploy.md).
  if (app.isPackaged) {
    electronUpdater.autoUpdater.checkForUpdatesAndNotify().catch(logError);
  }
}

void start();
