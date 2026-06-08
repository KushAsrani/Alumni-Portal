export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'alumni-portal-theme';

export const getStoredTheme = (): ThemeMode => {
  if (typeof window === 'undefined') return 'light';
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
};

export const applyTheme = (theme: ThemeMode) => {
  if (typeof document === 'undefined') return;
  document.documentElement?.setAttribute('data-theme', theme);
};

export const persistTheme = (theme: ThemeMode) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // no-op
  }
};

export const setTheme = (theme: ThemeMode): ThemeMode => {
  const resolvedTheme: ThemeMode = theme === 'dark' ? 'dark' : 'light';
  applyTheme(resolvedTheme);
  persistTheme(resolvedTheme);
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('alumni-theme-change', { detail: { theme: resolvedTheme } }));
  }
  return resolvedTheme;
};

export const toggleTheme = (): ThemeMode => {
  const currentTheme = getStoredTheme();
  return setTheme(currentTheme === 'dark' ? 'light' : 'dark');
};
