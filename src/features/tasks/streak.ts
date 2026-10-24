/** Consecutive days (ending today, or yesterday if today has none yet) with at least one completion. */
export function streakOf(series: { count: number }[]): number {
  let i = series.length - 1;
  if (i >= 0 && series[i]!.count === 0) i--;
  let n = 0;
  for (; i >= 0 && series[i]!.count > 0; i--) n++;
  return n;
}
