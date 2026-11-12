export default function ThemeToggle({ theme, onToggle, compact = false }) {
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={onToggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`theme-toggle inline-flex items-center rounded-full border transition-all ${
        compact ? "h-10 w-10 justify-center" : "gap-2 px-3 py-2 text-sm font-semibold"
      }`}
    >
      <i className={`ti ${isDark ? "ti-sun" : "ti-moon"}`} style={{ fontSize: 18 }} />
      {!compact && <span>{isDark ? "Light" : "Dark"}</span>}
    </button>
  );
}
