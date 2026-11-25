// Renders the Windows installer's branding into build/ (electron-builder's buildResources):
//   icon.ico               app, installer and uninstaller icon (16–256 px)
//   installerSidebar.bmp   welcome and finish pages (164×314)
//   installerHeader.bmp    progress page header (150×57)
// The outputs are committed, so the Windows CI job needs no browser. Run it again after
// changing the art:  pnpm --filter @steward/desktop installer:art
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

/* global Image, OffscreenCanvas -- used inside page.evaluate, which runs in the browser */

const out = join(import.meta.dirname, "..", "build");

// Brand orange and the pill mark, as in packages/ui (logo.tsx, globals.css).
const BRAND = "#ea580c";
const BRAND_DEEP = "#c2410c";
const pill = (stroke, width = 2.4) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>`;

const base = `<style>
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
  body { font-family: "Segoe UI", -apple-system, "Helvetica Neue", Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  .mark { display: flex; align-items: center; justify-content: center; }
  .mark svg { width: 56%; height: 56%; }
</style>`;

// Larger sizes keep a small margin, like other Windows app icons; small ones use every pixel.
const icon = (size) => {
  const pad = size >= 48 ? Math.round(size * 0.06) : 0;
  const s = size - pad * 2;
  return `${base}
<div class="mark" style="margin:${pad}px;width:${s}px;height:${s}px;border-radius:${s * 0.22}px;
  background:linear-gradient(160deg,#f97316,${BRAND} 55%,${BRAND_DEEP})">
  ${pill("#fff", size <= 24 ? 2.8 : 2.4)}
</div>`;
};

const sidebar = `${base}
<div style="position:relative;width:164px;height:314px;overflow:hidden;color:#fff;
  background:linear-gradient(165deg,#f97316 0%,${BRAND} 48%,${BRAND_DEEP} 100%)">
  <div style="position:absolute;right:-70px;bottom:-60px;width:230px;height:230px;opacity:.13">
    ${pill("#fff", 1.6)}
  </div>
  <div class="mark" style="position:absolute;left:20px;top:24px;width:44px;height:44px;
    border-radius:11px;background:#fff;box-shadow:0 6px 16px rgba(124,45,18,.28)">
    ${pill(BRAND, 2.6)}
  </div>
  <div style="position:absolute;left:20px;top:88px;right:14px">
    <div style="font-size:22px;line-height:1.08;font-weight:700;letter-spacing:-.02em">Steward<br>Pharmacy</div>
    <div style="margin-top:10px;width:24px;height:3px;border-radius:2px;background:rgba(255,255,255,.7)"></div>
    <div style="margin-top:10px;font-size:11.5px;line-height:1.4;opacity:.9">Point of sale and<br>inventory for the<br>pharmacy counter</div>
  </div>
</div>`;

const header = `${base}
<div style="width:150px;height:57px;background:#fff;display:flex;align-items:center;justify-content:flex-end;padding-right:14px">
  <div class="mark" style="width:34px;height:34px;border-radius:8px;
    background:linear-gradient(160deg,#f97316,${BRAND} 55%,${BRAND_DEEP})">${pill("#fff")}</div>
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

/** Renders HTML at width×height and returns the PNG and its RGBA pixels. */
async function render(html, width, height) {
  await page.setViewportSize({ width, height });
  await page.setContent(html);
  const png = await page.screenshot({ omitBackground: true, type: "png" });
  const rgba = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = new OffscreenCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return Array.from(ctx.getImageData(0, 0, img.width, img.height).data);
  }, png.toString("base64"));
  return { png, rgba: Uint8Array.from(rgba), width, height };
}

/** 24-bit bottom-up BMP, the only kind NSIS's Modern UI accepts. */
function bmp({ rgba, width, height }) {
  const stride = Math.ceil((width * 3) / 4) * 4;
  const buf = Buffer.alloc(54 + stride * height);
  buf.write("BM", 0);
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(stride * height, 34);
  for (let y = 0; y < height; y++) {
    const row = 54 + (height - 1 - y) * stride;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Flatten onto white (the page background behind the header and sidebar).
      const a = rgba[i + 3] / 255;
      const blend = (c) => Math.round(c * a + 255 * (1 - a));
      buf[row + x * 3] = blend(rgba[i + 2]);
      buf[row + x * 3 + 1] = blend(rgba[i + 1]);
      buf[row + x * 3 + 2] = blend(rgba[i]);
    }
  }
  return buf;
}

/** 32-bit BGRA DIB with an AND mask, the classic ICO entry every Windows tool reads. */
function dib({ rgba, width, height }) {
  const maskStride = Math.ceil(width / 32) * 4;
  const buf = Buffer.alloc(40 + width * height * 4 + maskStride * height);
  buf.writeUInt32LE(40, 0);
  buf.writeInt32LE(width, 4);
  buf.writeInt32LE(height * 2, 8);
  buf.writeUInt16LE(1, 12);
  buf.writeUInt16LE(32, 14);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const o = 40 + ((height - 1 - y) * width + x) * 4;
      buf[o] = rgba[i + 2];
      buf[o + 1] = rgba[i + 1];
      buf[o + 2] = rgba[i];
      buf[o + 3] = rgba[i + 3];
    }
  }
  return buf;
}

function ico(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, n) => {
    const e = 6 + n * 16;
    header[e] = size >= 256 ? 0 : size;
    header[e + 1] = size >= 256 ? 0 : size;
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

const icons = [];
for (const size of [16, 24, 32, 48, 64, 128, 256]) {
  const r = await render(icon(size), size, size);
  // 256 px is stored as PNG (Windows Vista+); smaller sizes as DIBs.
  icons.push({ size, data: size === 256 ? r.png : dib(r) });
}
await writeFile(join(out, "icon.ico"), ico(icons));
await writeFile(join(out, "icon.png"), (await render(icon(512), 512, 512)).png);
await writeFile(join(out, "installerSidebar.bmp"), bmp(await render(sidebar, 164, 314)));
await writeFile(join(out, "installerHeader.bmp"), bmp(await render(header, 150, 57)));

await browser.close();
process.stdout.write(`Wrote installer art to ${out}\n`);
