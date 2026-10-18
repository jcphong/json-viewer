const BYTE_UNITS = ["B", "KB", "MB", "GB"] as const;

/** Human-readable byte size using binary (1024) steps, e.g. 52428800 -> "50.0 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return unit === 0 ? `${value} B` : `${value.toFixed(1)} ${BYTE_UNITS[unit]}`;
}

const countFormatter = new Intl.NumberFormat("en-US");

/** Integer count with thousands separators, e.g. 200000 -> "200,000". */
export function formatCount(count: number): string {
  if (!Number.isFinite(count)) return "—";
  return countFormatter.format(Math.round(count));
}

/** Duration in ms, switching to seconds at 1s, e.g. 42.3 -> "42 ms", 2150 -> "2.15 s". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}
