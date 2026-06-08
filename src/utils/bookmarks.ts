export const BOOKMARK_STORAGE_KEY = 'alumni-directory-bookmarks';

export const loadBookmarks = (): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(BOOKMARK_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

export const saveBookmarks = (bookmarks: string[]) => {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(bookmarks));
    return true;
  } catch {
    return false;
  }
};

export const toggleBookmark = (bookmarks: string[], id: string) => {
  const next = bookmarks.includes(id) ? bookmarks.filter((item) => item !== id) : [...bookmarks, id];
  return { bookmarks: next, isBookmarked: next.includes(id) };
};
