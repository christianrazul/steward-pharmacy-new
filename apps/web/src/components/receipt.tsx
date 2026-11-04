import { formatManila, formatPhPhone } from "@steward/domain";
import type { SaleReceipt } from "@steward/data";

const money = (centavos: number) => (centavos / 100).toFixed(2);

/**
 * The printed receipt (mockup .receipt), in Geist Mono on white in both themes.
 * Fields follow the brief; BIR requirements are being confirmed, so the layout
 * stays in this one component.
 */
export function Receipt({ sale }: { sale: SaleReceipt }) {
  const soldAt = new Date(sale.soldAt);
  return (
    <div className="flex justify-center border-y border-border bg-muted p-5">
      <div
        data-slot="receipt"
        className="receipt-paper relative w-full max-w-[340px] bg-white px-5 pt-[22px] pb-[26px] font-mono text-xs leading-[1.55] text-[#18181b] shadow-[0_1px_2px_rgba(0,0,0,.08),0_8px_24px_-8px_rgba(0,0,0,.18)]"
      >
        <div className="text-center">
          <div className="font-sans text-[15px] font-semibold tracking-[-0.01em]">
            Steward Pharmacy
          </div>
          <div>{sale.branch.name} branch</div>
          {sale.branch.address !== "" && (
            <div>
              {sale.branch.address}, {sale.branch.city}
            </div>
          )}
          {sale.branch.phone !== "" && <div>Tel. {formatPhPhone(sale.branch.phone)}</div>}
          <div className="text-[#71717a]">VAT Reg TIN 000-000-000-000</div>
        </div>
        <Rule />
        <Line left={sale.receiptNo} right={formatManila(soldAt, "MM/dd/yyyy h:mm a")} />
        <Line left="Cashier" right={sale.cashierName} />
        <Rule />
        {sale.lines.map((line, index) => (
          <div key={index} className="mb-1">
            <div>{line.name}</div>
            <div className="flex justify-between gap-2 text-[#71717a]">
              <span>
                {"  "}
                {line.qty} x {money(line.unitPriceCentavos)}
                {line.isTaxable ? "" : " (non-VAT)"}
              </span>
              <span className="whitespace-nowrap text-[#18181b]">
                {money(line.lineTotalCentavos)}
              </span>
            </div>
          </div>
        ))}
        <Rule />
        <Line left={`Subtotal (${sale.itemCount} items)`} right={money(sale.subtotal)} />
        {sale.vatExemptRemoved > 0 && (
          <Line left="Less VAT (exempt)" right={`-${money(sale.vatExemptRemoved)}`} />
        )}
        {sale.discount > 0 && (
          <Line left={sale.discountLabel ?? "Discount"} right={`-${money(sale.discount)}`} />
        )}
        <div className="mt-1.5 flex justify-between gap-2 text-[15px] font-semibold">
          <span>TOTAL</span>
          <span>₱{money(sale.total)}</span>
        </div>
        <Rule />
        <Line
          left={sale.paymentMethod === "cash" ? "Cash" : "GCash"}
          right={money(sale.cashReceived ?? sale.total)}
        />
        {sale.change !== null && sale.change > 0 && (
          <Line left="Change" right={money(sale.change)} />
        )}
        {sale.gcashRef !== null && <Line muted left="Ref" right={sale.gcashRef} />}
        {sale.isVatExemptSale ? (
          <Line muted left="VAT-exempt sale" right={money(sale.total)} />
        ) : (
          <>
            <Line muted left="VATable sales" right={money(sale.vatable)} />
            {sale.nonVat > 0 && <Line muted left="VAT-exempt items" right={money(sale.nonVat)} />}
            <Line muted left="VAT" right={money(sale.vat)} />
          </>
        )}
        <Rule />
        <div className="text-center text-[#71717a]">
          {sale.synced ? "Synced to cloud" : "Saved offline · syncs on reconnect"}
        </div>
        <div className="mt-1 text-center">Thank you, get well soon!</div>
      </div>
    </div>
  );
}

function Rule() {
  return <div className="my-2.5 border-t border-dashed border-[#a1a1aa]" />;
}

function Line({ left, right, muted = false }: { left: string; right: string; muted?: boolean }) {
  return (
    <div
      className={muted ? "flex justify-between gap-2 text-[#71717a]" : "flex justify-between gap-2"}
    >
      <span>{left}</span>
      <span className="whitespace-nowrap">{right}</span>
    </div>
  );
}
