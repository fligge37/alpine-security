export function formatRelativeTime(isoTimestamp: string): string {
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  const diffMinutes = Math.round(diffMs / 60_000);

  if (diffMinutes < 1) return 'gerade eben';
  if (diffMinutes < 60) return `vor ${diffMinutes} Min.`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `vor ${diffHours} Std.`;

  const diffDays = Math.round(diffHours / 24);
  return `vor ${diffDays} Tag${diffDays === 1 ? '' : 'en'}`;
}
