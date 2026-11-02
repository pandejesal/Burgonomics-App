package com.burgonomics;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * Guards the popup WebView's external-link policy introduced with the Maps
 * hand-off.
 *
 * fe32c68 enabled multiple windows so Razorpay's bank/OTP windows could open,
 * but the popup client returned false for every http(s) URL. That trapped the
 * tracker's "Open in Google Maps" link inside the popup instead of leaving the
 * app. The fix externalises ONLY strict Maps URLs; everything else — including
 * Razorpay, bank and OTP pages — must keep loading in the popup so
 * window.opener can still report the payment result.
 *
 * These are the route/host guards the policy depends on.
 */
public class MainActivityMapsHandoffTest {

    @Test
    public void acceptsTheDirectionsAndSearchUrlsThisAppBuilds() {
        // getDirectionsUrl() output.
        assertTrue(
            MainActivity.isGoogleMapsTarget(
                "https", "www.google.com", "/maps/dir/"
            )
        );
        // getPermanentMapUrl() output.
        assertTrue(
            MainActivity.isGoogleMapsTarget(
                "https", "www.google.com", "/maps/search/"
            )
        );
        assertTrue(MainActivity.isGoogleMapsTarget("https", "maps.google.com", "/maps"));
        assertTrue(MainActivity.isGoogleMapsTarget("https", "google.com", "/maps/place/x"));
    }

    @Test
    public void rejectsLookalikeHostsThatContainTheAllowlistedName() {
        // Suffix/prefix confusion must never pass.
        assertFalse(MainActivity.isGoogleMapsTarget("https", "evil-google.com", "/maps/dir/"));
        assertFalse(MainActivity.isGoogleMapsTarget("https", "google.com.evil.tld", "/maps/dir/"));
        assertFalse(MainActivity.isGoogleMapsTarget("https", "notgoogle.com", "/maps/dir/"));
        assertFalse(MainActivity.isGoogleMapsTarget("https", "google.com.evil", "/maps"));
        assertFalse(MainActivity.isGoogleMapsTarget("https", "maps.google.com.evil.tld", "/maps"));
        assertFalse(MainActivity.isGoogleMapsTarget("https", null, "/maps"));
    }

    @Test
    public void rejectsNonMapsPathsOnTheMapsHost() {
        assertFalse(MainActivity.isGoogleMapsTarget("https", "www.google.com", "/search"));
        assertFalse(MainActivity.isGoogleMapsTarget("https", "www.google.com", "/mapsfoo"));
        assertFalse(MainActivity.isGoogleMapsTarget("https", "www.google.com", "/"));
        assertFalse(MainActivity.isGoogleMapsTarget("https", "www.google.com", null));
    }

    @Test
    public void rejectsPlainHttpAndNonHttpsSchemes() {
        assertFalse(MainActivity.isGoogleMapsTarget("http", "www.google.com", "/maps/dir/"));
        assertFalse(MainActivity.isGoogleMapsTarget("intent", "www.google.com", "/maps/dir/"));
        assertFalse(MainActivity.isGoogleMapsTarget("javascript", "www.google.com", "/maps/dir/"));
    }

    @Test
    public void keepsCheckoutAndBankUrlsInsideThePopup() {
        // Razorpay checkout must stay in the popup: externalising it would lose
        // window.opener and break payment result reporting.
        assertFalse(
            MainActivity.isGoogleMapsTarget("https", "checkout.razorpay.com", "/v1/checkout")
        );
        assertFalse(
            MainActivity.isGoogleMapsTarget("https", "api.razorpay.com", "/v1/payments")
        );
        // Bank / OTP pages are arbitrary hosts and are never allowlisted.
        assertFalse(MainActivity.isGoogleMapsTarget("https", "netbanking.hdfcbank.com", "/login"));
    }
}
