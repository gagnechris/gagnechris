const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Local calendar day as `yyyy-mm-dd` (not UTC). */
export function localToday(): string {
  const d = new Date();
  return formatLocalDate(d);
}

export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseLocalDate(value: string): Date | null {
  if (!DATE_RE.test(value)) return null;
  const [ys, ms, ds] = value.split('-');
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}

export function addLocalDays(value: string, delta: number): string {
  const date = parseLocalDate(value);
  if (!date) return value;
  date.setDate(date.getDate() + delta);
  return formatLocalDate(date);
}

export function startOfMonth(value: string): string {
  const date = parseLocalDate(value);
  if (!date) return value;
  date.setDate(1);
  return formatLocalDate(date);
}

export function monthBounds(value: string): { from: string; to: string } {
  const date = parseLocalDate(value);
  if (!date) {
    const today = localToday();
    return { from: today, to: today };
  }
  const from = formatLocalDate(
    new Date(date.getFullYear(), date.getMonth(), 1),
  );
  const to = formatLocalDate(
    new Date(date.getFullYear(), date.getMonth() + 1, 0),
  );
  return { from, to };
}

/** Sunday-start month grid cells (null = padding). */
export function monthGrid(value: string): (string | null)[] {
  const date = parseLocalDate(value);
  if (!date) return [];
  const year = date.getFullYear();
  const month = date.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startPad = first.getDay(); // 0 = Sunday
  const cells: (string | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(formatLocalDate(new Date(year, month, day)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function monthLabel(value: string): string {
  const date = parseLocalDate(value);
  if (!date) return value;
  return date.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}
