// Applies the saved theme before first paint to avoid a light flash.
// Loaded as a plain blocking script from index.html (not inline, so the CSP can forbid inline scripts).
// Mirrors src/store/useThemeStore.ts — keep the storage key and logic in sync.
(() => {
  var theme = null;
  try {
    theme = localStorage.getItem("json-viewer:theme");
  } catch (_) {}
  var dark =
    theme === "dark" ||
    (theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.add(dark ? "dark" : "light");
})();
