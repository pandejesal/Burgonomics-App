# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# ── Capacitor / WebView keep rules ──────────────────────────────────────
# Keep the Capacitor bridge and plugin classes so native ↔ JS communication works.
-keep class com.getcapacitor.** { *; }
-keep class com.glassdoorsstudio.burgonomics.** { *; }

# Keep JavaScript interface methods for WebView bridge.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep Cordova plugin classes (used by capacitor-cordova-android-plugins).
-keep class org.apache.cordova.** { *; }

# ── AndroidX / Support ──────────────────────────────────────────────────
-keep class androidx.core.app.CoreComponentFactory { *; }

# ── Preserve line number information for debugging stack traces ─────────
-keepattributes SourceFile,LineNumberTable

# Hide the original source file name in stack traces.
-renamesourcefileattribute SourceFile

# ── Suppress common R8 warnings for libraries ──────────────────────────
-dontwarn org.apache.cordova.**
-dontwarn com.getcapacitor.**
