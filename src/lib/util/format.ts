/** Display formatting helpers shared by the server-rendered pages. */

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatRelative(value: Date | string | null | undefined): string {
  if (!value) return "never";
  const d = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.round((Date.now() - d.getTime()) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(d);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString();
}

/** Turns SCREAMING_SNAKE_CASE into "Screaming snake case". */
export function humanizeEnum(value: string): string {
  const spaced = value.replace(/_/g, " ").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/** Shows a URL compactly: host plus a shortened path. */
export function displayUrl(url: string, maxPath = 40): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : truncate(u.pathname, maxPath);
    return `${u.host}${path}`;
  } catch {
    return truncate(url, 60);
  }
}
