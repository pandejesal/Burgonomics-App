import React, { useState } from "react";
import { Download, FileText, CheckCircle2, Printer } from "lucide-react";
import { formatINR } from "@/core/utils/format";
import type { Order } from "../models";

interface InvoiceDownloadButtonProps {
  order: Order;
  className?: string;
  variant?: "button" | "icon";
}

export function InvoiceDownloadButton({
  order,
  className = "",
  variant = "button",
}: InvoiceDownloadButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownloadInvoice = () => {
    setIsGenerating(true);

    const invoiceWindow = window.open("", "_blank");
    if (!invoiceWindow) {
      setIsGenerating(false);
      return;
    }

    const shortOrder = order.shortCode || order.id.slice(-6).toUpperCase();
    const dateFormatted = new Date(order.placedAt || Date.now()).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    const itemsHtml = order.items
      ?.map(
        (item) => `
        <tr>
          <td style="padding: 8px 4px; border-bottom: 1px solid #e5e5e5;">${item.name}</td>
          <td style="padding: 8px 4px; border-bottom: 1px solid #e5e5e5; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px 4px; border-bottom: 1px solid #e5e5e5; text-align: right;">${formatINR(item.unitPrice || 0)}</td>
          <td style="padding: 8px 4px; border-bottom: 1px solid #e5e5e5; text-align: right; font-weight: bold;">${formatINR((item.unitPrice || 0) * (item.quantity || 1))}</td>
        </tr>
      `
      )
      .join("");

    const grandTotal = order.totals?.grandTotal || 0;
    const taxes = order.totals?.taxes || Math.round(grandTotal * 0.05);
    const packing = order.totals?.packingFee || 0;
    const delivery = order.totals?.deliveryFee || 0;

    const invoiceContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Tax Invoice - #${shortOrder}</title>
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
          .footer { margin-top: 24px; border-top: 1px dashed #ccc; padding-top: 12px; font-size: 10px; color: #666; text-align: center; }
          @media print { .no-print { display: none; } body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 16px; text-align: right;">
          <button onclick="window.print()" style="background: #0E4825; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: bold; cursor: pointer;">
            Print / Save as PDF
          </button>
        </div>

        <div class="header">
          <div class="brand">BURGONOMICS</div>
          <div style="font-size: 11px; color: #555;">Burgonomics Foodworks Pvt. Ltd. • GSTIN: 24AAACB1234F1Z5</div>
          <div style="font-size: 10px; color: #777;">FSSAI Lic No: 10723026000492</div>
        </div>

        <div class="meta-grid">
          <div>
            <strong>Invoice & Order:</strong> #${shortOrder}<br>
            <strong>Date & Time:</strong> ${dateFormatted}<br>
            <strong>Fulfillment:</strong> ${order.fulfillment.toUpperCase()}<br>
            <strong>Payment Mode:</strong> ${(order.payment?.method || "ONLINE").toUpperCase()}
          </div>
          <div>
            <strong>Store Outlet:</strong> ${order.store?.name || "Burgonomics Flagship"}<br>
            <strong>Address:</strong> ${order.store?.address || "Ahmedabad, Gujarat"}<br>
            <strong>Phone:</strong> ${order.store?.phone || "+91 98250 99881"}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Item Description</th>
              <th style="text-align: center;">Qty</th>
              <th style="text-align: right;">Rate</th>
              <th style="text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="totals">
          <div class="totals-row">
            <span>GST & Service Taxes (5%):</span>
            <span>${formatINR(taxes)}</span>
          </div>
          ${
            packing > 0
              ? `<div class="totals-row"><span>Packaging Fee:</span><span>${formatINR(packing)}</span></div>`
              : ""
          }
          ${
            delivery > 0
              ? `<div class="totals-row"><span>Delivery Fee:</span><span>${formatINR(delivery)}</span></div>`
              : ""
          }
          <div class="totals-row grand-total">
            <span>Total Amount Paid:</span>
            <span>${formatINR(grandTotal)}</span>
          </div>
        </div>

        <div class="footer">
          Thank you for choosing Burgonomics! • For feedback & support: support@burgonomics.in<br>
          This is a computer-generated tax invoice. No physical signature required.
        </div>

        <script>
          setTimeout(() => {
            window.print();
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
        title="Download GST Invoice"
        className={`p-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50 ${className}`}
      >
        <Download className="w-4 h-4 text-emerald-400" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleDownloadInvoice}
      disabled={isGenerating}
      className={`px-3.5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 hover:text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${className}`}
    >
      <FileText className="w-3.5 h-3.5 text-emerald-400" />
      <span>{isGenerating ? "Preparing Invoice..." : "Download Invoice"}</span>
    </button>
  );
}

export default InvoiceDownloadButton;
