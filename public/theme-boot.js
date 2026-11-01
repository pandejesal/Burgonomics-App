/*
 * Applies the saved or system appearance before any React paint.
 *
 * This ran as an inline <script> in index.html until the hosting CSP
 * (`script-src 'self' …`, no 'unsafe-inline') blocked it on first load. It is
 * now served from this same-origin file so it satisfies the strict policy and
 * still executes before the first paint. Mirrors --background /
 * applyThemePreference in src/styles.css and
 * src/features/settings/state/settingsStore.ts.
 */
(function () {
  var root = document.documentElement;
  var resolved = "light";
  try {
    var raw = window.localStorage.getItem("burg.settings");
    var theme = "system";
    if (raw) {
      var parsed = JSON.parse(raw);
      var state =
        parsed && typeof parsed === "object"
          ? parsed.state && typeof parsed.state === "object"
            ? parsed.state
            : parsed
          : null;
      if (state && (state.theme === "system" || state.theme === "light" || state.theme === "dark")) {
        theme = state.theme;
      }
    }
    if (theme === "system") {
      resolved =
        window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    } else {
      resolved = theme;
    }
  } catch (error) {
    resolved =
      window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  }
  root.classList.toggle("dark", resolved === "dark");
  root.setAttribute("data-theme", resolved);
  root.style.colorScheme = resolved;
  root.style.setProperty("--boot-canvas", resolved === "dark" ? "#000000" : "#FFFFFF");
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "dark" ? "#000000" : "#FFFFFF");
})();
