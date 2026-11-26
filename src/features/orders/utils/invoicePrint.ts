/**
 * A6-c11 item 5 — how the receipt popup actually prints.
 *
 * On the web `window.print()` is the whole story. Inside the Android shell the
 * receipt is rendered in a `WebView` hosted by a `Dialog` (MainActivity
 * `openPopup`), and `window.print()` there is a documented NO-OP: the customer
 * saw a receipt page whose "Print / Save as PDF" button did nothing, and no
 * file was ever produced.
 *
 * The native shell therefore injects a `BurgonomicsPrint` JavascriptInterface on
 * the popup that hands the WebView to Android's `PrintManager`
 * (`createPrintDocumentAdapter`), which is what offers "Save as PDF" and the
 * printer list. The popup script prefers that bridge and falls back to
 * `window.print()` only when it is absent — i.e. on the web build.
 *
 * Kept as a string constant so the exact script that ships inside the popup is
 * the exact script under test, instead of an untestable inline snippet.
 */

/** Name of the JavascriptInterface the Android shell adds to the popup. */
export const NATIVE_PRINT_BRIDGE = "BurgonomicsPrint";

/**
 * The popup's print routine: native bridge first, `window.print()` as the web
 * fallback. `window.__bgnPrint` is installed once and reused by both the
 * toolbar button and the automatic print after the receipt is written.
 */
export function invoicePrintScript(): string {
  return [
    "window.__bgnPrint = function () {",
    `  try { if (window.${NATIVE_PRINT_BRIDGE} && typeof window.${NATIVE_PRINT_BRIDGE}.print === "function") { window.${NATIVE_PRINT_BRIDGE}.print(); return true; } } catch (e) {}`,
    "  try { window.print(); return true; } catch (e) { return false; }",
    "};",
  ].join("\n");
}

/** The anchor markup for the receipt's own "Print / Save as PDF" control. */
export function invoicePrintButtonOnClick(): string {
  return "window.__bgnPrint ? window.__bgnPrint() : window.print()";
}
