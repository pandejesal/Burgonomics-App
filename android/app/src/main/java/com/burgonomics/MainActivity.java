package com.burgonomics;

import android.app.Dialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.view.KeyEvent;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Razorpay's web checkout opens bank and OTP pages with window.open. A WebView drops
        // those unless popups are enabled, and the payment then fails after the customer picks
        // a bank.
        WebView webView = getBridge().getWebView();
        WebSettings settings = webView.getSettings();
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        webView.setWebChromeClient(
            new BridgeWebChromeClient(getBridge()) {
                @Override
                public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                    return openPopup(view, resultMsg);
                }
            }
        );
    }

    /** Shows a popup full screen, keeping window.opener so it can report back to checkout. */
    private boolean openPopup(WebView parent, Message resultMsg) {
        final WebView popup = new WebView(this);
        WebSettings settings = popup.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);

        final Dialog dialog = new Dialog(this, android.R.style.Theme_Black_NoTitleBar_Fullscreen);
        dialog.setContentView(popup);
        dialog.setOnKeyListener(
            (d, keyCode, event) -> {
                if (keyCode != KeyEvent.KEYCODE_BACK || event.getAction() != KeyEvent.ACTION_UP) return false;
                if (popup.canGoBack()) popup.goBack();
                else d.dismiss();
                return true;
            }
        );
        dialog.setOnDismissListener(d -> popup.destroy());

        popup.setWebViewClient(
            new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    Uri url = request.getUrl();
                    String scheme = url.getScheme();
                    if ("http".equals(scheme) || "https".equals(scheme)) {
                        // Google Maps belongs to another app. Enabling multiple windows sent
                        // every target="_blank" link (including the tracker's "Open in Google
                        // Maps") into this popup, where loading the web map left the customer
                        // on an in-app page instead of the Maps app. Hand off ONLY strict Maps
                        // URLs; Razorpay and bank pages must keep loading here so
                        // window.opener can still report the payment result.
                        if (isGoogleMapsUrl(url) && openExternally(url)) return true;
                        // No Maps handler installed: load it here so the link still resolves
                        // visibly instead of leaving a blank popup.
                        return false;
                    }
                    // UPI and bank app links belong to other apps.
                    openExternally(url);
                    return true;
                }
            }
        );
        popup.setWebChromeClient(
            new WebChromeClient() {
                @Override
                public void onCloseWindow(WebView window) {
                    dialog.dismiss();
                }
            }
        );

        dialog.show();
        WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
        transport.setWebView(popup);
        resultMsg.sendToTarget();
        return true;
    }

    /**
     * Strict Google Maps hand-off allowlist, on primitives so it is unit
     * testable without an Android runtime.
     *
     * Only the two HTTPS Maps shapes this app produces are accepted:
     *   https://www.google.com/maps/...   (getDirectionsUrl / getPermanentMapUrl)
     *   https://maps.google.com/maps/...
     * The host is compared exactly, never by substring, so `evil-google.com` and
     * `google.com.evil.tld` fail. Nothing else is externalised: Razorpay, bank
     * and OTP pages keep loading inside the popup so `window.opener` can still
     * report the payment result.
     */
    static boolean isGoogleMapsTarget(String scheme, String host, String path) {
        if (!"https".equals(scheme)) return false;
        if (host == null) return false;
        String normalised = host.toLowerCase(java.util.Locale.ROOT);
        if (
            !"google.com".equals(normalised) &&
            !"www.google.com".equals(normalised) &&
            !"maps.google.com".equals(normalised)
        ) {
            return false;
        }
        if (path == null) return false;
        // /maps and /maps/... only — never a lookalike such as /mapsfoo.
        return path.equals("/maps") || path.startsWith("/maps/");
    }

    private static boolean isGoogleMapsUrl(Uri url) {
        if (url == null) return false;
        return isGoogleMapsTarget(url.getScheme(), url.getHost(), url.getPath());
    }

    /** Opens a URL outside this app. Returns false when nothing can handle it. */
    private boolean openExternally(Uri url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, url));
            return true;
        } catch (ActivityNotFoundException e) {
            return false;
        }
    }
}
