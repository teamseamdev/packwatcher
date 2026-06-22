const lastRunByKey = new Map<string, number>();

export function assertRateLimit(key: string, intervalMs = 30_000) {
  const now = Date.now();
  const lastRun = lastRunByKey.get(key) ?? 0;
  const remaining = intervalMs - (now - lastRun);

  if (remaining > 0) {
    throw new Error(`Rate limited. Try again in ${Math.ceil(remaining / 1000)} seconds.`);
  }

  lastRunByKey.set(key, now);
}
