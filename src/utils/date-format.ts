function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function timeAgo(date: Date | string): string {
  const target = toDate(date);
  const diffMs = Date.now() - target.getTime();

  if (Number.isNaN(target.getTime())) {
    return 'Invalid date';
  }

  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 10) return 'just now';
  if (diffSeconds < 60) return `${diffSeconds} seconds ago`;

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes === 1) return '1 minute ago';
  if (diffMinutes < 60) return `${diffMinutes} minutes ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 30) return `${diffDays} days ago`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return '1 month ago';
  if (diffMonths < 12) return `${diffMonths} months ago`;

  const diffYears = Math.floor(diffDays / 365);
  if (diffYears === 1) return '1 year ago';
  return `${diffYears} years ago`;
}

export function formatDate(date: Date | string, locale = 'en-US'): string {
  const target = toDate(date);

  if (Number.isNaN(target.getTime())) {
    return 'Invalid date';
  }

  return target.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
