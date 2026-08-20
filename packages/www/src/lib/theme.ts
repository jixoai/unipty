export type Theme = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "theme";

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    return "system";
  }
  return "system";
}

export function persistTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage unavailable — theme stays session-only */
  }
}

function syncDocumentColorScheme(): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.colorScheme = document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";
}

export function applyTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  if (theme === "system") {
    const prefersDark =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", prefersDark);
  } else {
    root.classList.toggle("dark", theme === "dark");
  }
  syncDocumentColorScheme();
}

/** Applies the stored theme on mount and follows OS scheme changes in system mode. */
export function installThemeSync(): () => void {
  if (typeof window === "undefined") return () => undefined;

  const sync = () => {
    applyTheme(getStoredTheme());
  };

  sync();
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const handleChange = () => {
    if (getStoredTheme() === "system") {
      sync();
    }
  };

  media.addEventListener("change", handleChange);
  return () => media.removeEventListener("change", handleChange);
}
