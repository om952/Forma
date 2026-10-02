/**
 * Dates spelled out ("2 Oct 2026") rather than numeric: "02/10/2026" is
 * 2 October in India and 10 February in the US, and the viewer can't tell
 * which one they're looking at.
 */
export const formatDate = (value: string | Date) =>
  new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** "2 Oct 2026, 14:05" in the viewer's locale and time zone. */
export const formatDateTime = (value: string | Date) =>
  new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
