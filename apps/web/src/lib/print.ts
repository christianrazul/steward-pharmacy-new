import { formatManila, formatPhPhone } from "@steward/domain";
import type { SaleReceipt } from "@steward/data";
import { desktopBridge } from "@steward/data/local";
import { toast } from "sonner";

/**
 * Browser printing for thermal receipt printers (58mm or 80mm paper).
 * The receipt is written into a hidden iframe with its own @page size, so the
 * app around it never prints. The desktop app prints silently to the default
 * Windows printer, at the counter's paper width.
 */
export type PaperWidth = 58 | 80;

const WIDTH_KEY = "steward:print-width";

export function getPaperWidth(): PaperWidth {
  try {
    return localStorage.getItem(WIDTH_KEY) === "58" ? 58 : 80;
  } catch {
    return 80;
  }
}

export function setPaperWidth(width: PaperWidth): void {
  try {
    localStorage.setItem(WIDTH_KEY, String(width));
  } catch {
    // Storage blocked; printing falls back to 80mm.
  }
}

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );

const money = (centavos: number) => (centavos / 100).toFixed(2);

function line(left: string, right: string, className = ""): string {
  return `<div class="ln ${className}"><span>${escape(left)}</span><span>${escape(right)}</span></div>`;
}

/** The receipt as standalone HTML. Same fields and order as the on-screen Receipt. */
export function receiptHtml(sale: SaleReceipt, width: PaperWidth): string {
  const body = [
    `<div class="c"><div class="store">Steward Pharmacy</div><div>${escape(sale.branch.name)} branch</div>`,
    sale.branch.address
      ? `<div>${escape(sale.branch.address)}, ${escape(sale.branch.city)}</div>`
      : "",
    sale.branch.phone ? `<div>Tel. ${escape(formatPhPhone(sale.branch.phone))}</div>` : "",
    `<div>VAT Reg TIN 000-000-000-000</div></div><hr>`,
    line(sale.receiptNo, formatManila(new Date(sale.soldAt), "MM/dd/yyyy h:mm a")),
    line("Cashier", sale.cashierName),
    "<hr>",
    ...sale.lines.map(
      (item) =>
        `<div>${escape(item.name)}</div>${line(`  ${item.qty} x ${money(item.unitPriceCentavos)}${item.isTaxable ? "" : " (non-VAT)"}`, money(item.lineTotalCentavos))}`,
    ),
    "<hr>",
    line(`Subtotal (${sale.itemCount} items)`, money(sale.subtotal)),
    sale.vatExemptRemoved > 0 ? line("Less VAT (exempt)", `-${money(sale.vatExemptRemoved)}`) : "",
    sale.discount > 0 ? line(sale.discountLabel ?? "Discount", `-${money(sale.discount)}`) : "",
    line("TOTAL", `P${money(sale.total)}`, "big"),
    "<hr>",
    line(sale.paymentMethod === "cash" ? "Cash" : "GCash", money(sale.cashReceived ?? sale.total)),
    sale.change !== null && sale.change > 0 ? line("Change", money(sale.change)) : "",
    sale.gcashRef !== null ? line("Ref", sale.gcashRef) : "",
    sale.isVatExemptSale
      ? line("VAT-exempt sale", money(sale.total))
      : [
          line("VATable sales", money(sale.vatable)),
          sale.nonVat > 0 ? line("VAT-exempt items", money(sale.nonVat)) : "",
          line("VAT", money(sale.vat)),
        ].join(""),
    "<hr>",
    `<div class="c">${sale.synced ? "Synced to cloud" : "Saved offline - syncs on reconnect"}</div>`,
    `<div class="c">Thank you, get well soon!</div>`,
  ].join("");
  const paper = width === 58 ? "58mm" : "80mm";
  const font = width === 58 ? "10px" : "12px";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(sale.receiptNo)}</title><style>
@page { size: ${paper} auto; margin: 2mm; }
* { box-sizing: border-box; }
body { margin: 0; width: calc(${paper} - 4mm); font: ${font}/1.45 ui-monospace, Menlo, Consolas, monospace; color: #000; }
.c { text-align: center; } .store { font-weight: 700; font-size: 1.2em; }
.ln { display: flex; justify-content: space-between; gap: 6px; } .ln span:last-child { white-space: nowrap; }
.big { font-weight: 700; font-size: 1.15em; margin-top: 4px; }
hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
</style></head><body>${body}</body></html>`;
}

export function printReceipt(sale: SaleReceipt): void {
  const bridge = desktopBridge();
  if (bridge) {
    void (async () => {
      const device = await bridge.deviceInfo();
      const result = await bridge.print(receiptHtml(sale, device?.printWidth ?? 58));
      if (!result.ok) toast.error(result.error.message);
    })();
    return;
  }
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => {
      frame.remove();
    }, 1000);
  };
  frame.srcdoc = receiptHtml(sale, getPaperWidth());
  document.body.appendChild(frame);
}
