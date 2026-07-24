const SHANGHAI_OFFSET = 8 * 60 * 60 * 1000;

function localParts(now = Date.now()) {
  const shifted = new Date(now + SHANGHAI_OFFSET);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    date: shifted.getUTCDate(),
    day: shifted.getUTCDay(),
  };
}

export function startOfShanghaiDay(now = Date.now()) {
  const p = localParts(now);
  return Date.UTC(p.year, p.month, p.date) - SHANGHAI_OFFSET;
}

export function startOfShanghaiWeek(now = Date.now()) {
  const p = localParts(now);
  const mondayOffset = p.day === 0 ? 6 : p.day - 1;
  return startOfShanghaiDay(now) - mondayOffset * 86_400_000;
}

export function startOfShanghaiMonth(now = Date.now()) {
  const p = localParts(now);
  return Date.UTC(p.year, p.month, 1) - SHANGHAI_OFFSET;
}

export function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}
