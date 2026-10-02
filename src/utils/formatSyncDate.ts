/** "Oct 3, 2026, 3:42 PM" for sync dates (ISO strings from the server or project.json) */
export function formatSyncDate(iso: string | null): string {
  if (!iso) return 'an unknown date';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'an unknown date';
  return d.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
