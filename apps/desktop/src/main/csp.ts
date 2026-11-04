import { createHash } from "node:crypto";

/** Inline <script> bodies in a page (Next.js static export inlines its bootstrap data). */
export function inlineScripts(html: string): string[] {
  const scripts: string[] = [];
  const pattern = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    const body = match[1] ?? "";
    if (body.length > 0) scripts.push(body);
  }
  return scripts;
}

/**
 * A strict Content-Security-Policy for one page of the web build: scripts only
 * from the app itself plus the exact inline scripts in this file (by SHA-256),
 * no remote content at all. The renderer never talks to the network; the main
 * process does.
 */
export function contentSecurityPolicy(html: string): string {
  const hashes = inlineScripts(html).map(
    (body) => `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`,
  );
  return [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(" ")}`.trim(),
    // Radix and the charts set inline style attributes.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
