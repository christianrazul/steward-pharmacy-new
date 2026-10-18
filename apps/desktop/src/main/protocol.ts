import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";

import { contentSecurityPolicy } from "./csp";

export const APP_ORIGIN = "app://steward";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
};

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** Maps app://steward/pos/ to <webRoot>/pos/index.html, never outside webRoot. */
export async function resolveAppPath(webRoot: string, url: string): Promise<string | null> {
  const { pathname } = new URL(url);
  const clean = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
  const file = join(webRoot, clean);
  if (file !== webRoot && !file.startsWith(webRoot + sep)) return null;
  for (const candidate of [file, join(file, "index.html"), `${file}.html`]) {
    if (await isFile(candidate)) return candidate;
  }
  return null;
}

/** Serves the static web build the way Caddy does, with security headers on every response. */
export async function serveApp(webRoot: string, request: Request): Promise<Response> {
  const headers: Record<string, string> = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  };
  let file = await resolveAppPath(webRoot, request.url);
  let status = 200;
  if (!file) {
    file = join(webRoot, "404.html");
    status = 404;
  }
  const type = TYPES[extname(file)] ?? "application/octet-stream";
  const body = await readFile(file);
  if (type.startsWith("text/html")) {
    headers["content-security-policy"] = contentSecurityPolicy(body.toString("utf8"));
  }
  return new Response(body, { status, headers: { ...headers, "content-type": type } });
}
