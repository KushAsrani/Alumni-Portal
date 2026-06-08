export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'alumni-directory-theme';

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
  document.body?.setAttribute('data-theme', theme);
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
