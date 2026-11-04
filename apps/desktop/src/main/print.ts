import { BrowserWindow } from "electron";

/**
 * Prints a receipt silently to the default Windows printer. The receipt HTML
 * comes from the web UI; it loads in a hidden window with scripts disabled.
 */
export async function printSilently(html: string, widthMm: 58 | 80): Promise<void> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      javascript: false,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise<void>((resolve, reject) => {
      win.webContents.print(
        {
          silent: true,
          printBackground: false,
          margins: { marginType: "none" },
          pageSize: { width: widthMm * 1000, height: 297_000 },
        },
        (success, reason) => {
          if (success) resolve();
          else reject(new Error(reason));
        },
      );
    });
  } finally {
    win.destroy();
  }
}
