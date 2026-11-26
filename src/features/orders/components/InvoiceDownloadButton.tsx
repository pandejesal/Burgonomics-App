import React, { useState } from "react";
import { Download, FileText, CheckCircle2, Printer } from "lucide-react";
import { formatINR } from "@/core/utils/format";
import { APP, isUnsetRegistrationValue } from "@/core/constants/app";
import { resolveReceiptMoney } from "../utils/receiptMoney";
import { invoicePrintButtonOnClick, invoicePrintScript } from "../utils/invoicePrint";
import type { Order } from "../models";

interface InvoiceDownloadButtonProps {
  order: Order;
  className?: string;
  variant?: "button" | "icon";
  /**
   * Owner-scoped fresh read, supplied by every production mount. A cash
   * collection can land after the order was cached; the receipt must reflect
   * it. When the read fails or does not return the order, ALL payment claims
   * are withheld rather than guessed from the cached copy.
   */
  refreshBeforePrint?: (order: Order) => Promise<Order | null>;
}

export function InvoiceDownloadButton({
  order,
  className = "",
  variant = "button",
  refreshBeforePrint,
}: InvoiceDownloadButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  // Loop: order/store/item strings are interpolated into raw HTML below.
  // Escape them (merchant data is trusted, but invoices get saved/shared).
  const esc = (v: unknown): string =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const handleDownloadInvoice = async () => {
    setIsGenerating(true);

    // Open synchronously, inside the user gesture: a popup opened after an
    // awaited network read is routinely blocked by browsers.
    const invoiceWindow = window.open("", "_blank");
    if (!invoiceWindow) {
      setIsGenerating(false);
      return;
    }

    let currentOrder = order;
    let refreshFailed = false;
    if (refreshBeforePrint) {
      try {
        const fresh = await refreshBeforePrint(order);
        if (fresh) currentOrder = fresh;
        else refreshFailed = true;
      } catch {
        refreshFailed = true;
      }
    }

    const shortOrder = currentOrder.shortCode || currentOrder.id.slice(-6).toUpperCase();
    const dateFormatted = new Date(currentOrder.placedAt || Date.now()).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    // M8: money comes from integer paise stamped by the server and a matching
    // pricing breakdown — never a stale cart total or an uncollected tip.
    let money = resolveReceiptMoney(currentOrder);
    if (refreshFailed && money.source !== "cancelled") {
      // A failed fresh read cannot prove the current payment state. Withhold
      // every money claim, including "due", instead of printing cache fiction.
      // Cancellation is terminal and carries no claim, so it is kept as-is.
      money = {
        source: "unverified",
        totalLabel: "Payment status unconfirmed",
        total: null,
        rows: [],
        itemPrices: [],
      };
    }

    // Guarded: a corrupt/partial order doc without items must render an
    // empty table, never throw (?.map guards map, but .join on undefined
    // throws and leaves isGenerating stuck with a blank tab).
    // Repricing can leave unit prices stale: only print the Rate/Amount
    // columns when they still reconcile to the server's food subtotal.
    const itemsHtml = (currentOrder.items ?? [])
      .map((item, index) => {
        const price = money.itemPrices[index];
        return `
        <tr>
          <td style="padding: 8px 4px; border-bottom: 1px solid #e5e5e5;">${esc(item.name)}</td>
          <td style="padding: 8px 4px; border-bottom: 1px solid #e5e5e5; text-align: center;">${item.quantity}</td>
          ${
            price
              ? `<td style="padding: 8px 4px; border-bottom: 1px solid #e5e5e5; text-align: right;">${formatINR(price.unitPaise / 100)}</td>
                 <td style="padding: 8px 4px; border-bottom: 1px solid #e5e5e5; text-align: right; font-weight: bold;">${formatINR(price.linePaise / 100)}</td>`
              : ""
          }
        </tr>
      `;
      })
      .join("");

    const rowsHtml = money.rows
      .map(
        (row) => `
          <div class="totals-row">
            <span>${esc(row.label)}</span>
            <span>${formatINR(row.amount)}</span>
          </div>
        `,
      )
      .join("");

    const invoiceContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Order Receipt - #${shortOrder}</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #111; padding: 24px; max-width: 600px; margin: 0 auto; line-height: 1.4; }
          .header { border-bottom: 2px solid #0E4825; padding-bottom: 12px; margin-bottom: 16px; }
          .brand { color: #0E4825; font-size: 24px; font-weight: 900; letter-spacing: -0.5px; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 12px; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
          th { background: #f4f4f4; padding: 8px 4px; text-align: left; font-weight: bold; border-bottom: 1px solid #ccc; }
          .totals { margin-left: auto; width: 260px; font-size: 12px; }
          .totals-row { display: flex; justify-content: space-between; padding: 4px 0; }
          .grand-total { border-top: 2px solid #111; font-size: 14px; font-weight: 900; color: #0E4825; padding-top: 6px; margin-top: 4px; }
          .tax-note { font-size: 10px; color: #666; text-align: right; margin-top: 4px; }
          .footer { margin-top: 24px; border-top: 1px dashed #ccc; padding-top: 12px; font-size: 10px; color: #666; text-align: center; }
          @media print { .no-print { display: none; } body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 16px; text-align: right;">
          <button onclick="${invoicePrintButtonOnClick()}" style="background: #0E4825; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: bold; cursor: pointer;">
            Print / Save as PDF
          </button>
        </div>

        <div class="header">
          <div class="brand">BURGONOMICS</div>
          <div style="font-size: 11px; color: #555;">${esc(APP.legalEntity)}</div>
          <div style="font-size: 10px; color: #777;">${esc(APP.registeredAddress)}${
            isUnsetRegistrationValue(APP.gstin) ? "" : ` · GSTIN ${esc(APP.gstin)}`
          }<br>This is an order receipt, not a GST tax invoice.</div>
        </div>

        <div class="meta-grid">
          <div>
            <strong>Invoice & Order:</strong> #${esc(shortOrder)}<br>
            <strong>Date & Time:</strong> ${esc(dateFormatted)}<br>
            <strong>Fulfillment:</strong> ${esc(currentOrder.fulfillment).toUpperCase()}<br>
            <strong>Payment Mode:</strong> ${currentOrder.payment?.method ? esc(currentOrder.payment.method.toUpperCase()) : "—"}
          </div>
          <div>
            <strong>Store Outlet:</strong> ${esc(currentOrder.store?.name || "Burgonomics Outlet")}<br>
            <strong>Address:</strong> ${currentOrder.store?.address ? esc(currentOrder.store.address) : "—"}<br>
            <strong>Phone:</strong> ${currentOrder.store?.phone ? esc(currentOrder.store.phone) : "—"}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Item Description</th>
              <th style="text-align: center;">Qty</th>
              ${money.itemPrices.length > 0 ? '<th style="text-align: right;">Rate</th>' : ""}
              ${money.itemPrices.length > 0 ? '<th style="text-align: right;">Amount</th>' : ""}
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="totals">
          ${rowsHtml}
          <div class="totals-row grand-total">
            <span>${esc(money.totalLabel)}:</span>
            <span>${money.total === null ? "—" : formatINR(money.total)}</span>
          </div>
          <div class="tax-note">GST is already included in item prices and is not added again.</div>
        </div>

        <div class="footer">
          Thank you for choosing Burgonomics! • For feedback &amp; support: ${esc(APP.supportEmail)}<br>
          This is a computer-generated order receipt. No physical signature required.
        </div>

        <script>
          ${invoicePrintScript()}
          setTimeout(() => {
            if (window.__bgnPrint) window.__bgnPrint();
          }, 400);
        </script>
      </body>
      </html>
    `;

    invoiceWindow.document.open();
    invoiceWindow.document.write(invoiceContent);
    invoiceWindow.document.close();

    setTimeout(() => {
      setIsGenerating(false);
    }, 600);
  };

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleDownloadInvoice}
        disabled={isGenerating}
        title="Download order receipt"
        className={`grid h-11 w-11 place-items-center rounded-xl border border-divider bg-surface text-text transition-colors hover:bg-bg-secondary cursor-pointer disabled:opacity-50 ${className}`}
      >
        <Download className="h-4 w-4 text-primary-text" aria-hidden />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleDownloadInvoice}
      disabled={isGenerating}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-divider bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:bg-bg-secondary cursor-pointer disabled:opacity-50 ${className}`}
    >
      <FileText className="h-3.5 w-3.5 text-primary-text" aria-hidden />
      <span>{isGenerating ? "Preparing Invoice..." : "Download Invoice"}</span>
    </button>
  );
}

export default InvoiceDownloadButton;
