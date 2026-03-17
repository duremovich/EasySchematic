/**
 * Simple D1-based rate limiter.
 * Keys like "login:email:foo@bar.com", "login:ip:1.2.3.4", "submit:user:uuid"
 * Each window is 1 hour.
 */

function currentWindow(): string {
  const now = new Date();
  return now.toISOString().slice(0, 13); // "2026-03-16T14" — hourly buckets
}

export async function checkRateLimit(
  db: D1Database,
  key: string,
  limit: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const window = currentWindow();

  const row = await db
    .prepare("SELECT count FROM rate_limits WHERE key = ? AND window_start = ?")
    .bind(key, window)
    .first<{ count: number }>();

  const current = row?.count ?? 0;

  if (current >= limit) {
    return { allowed: false, remaining: 0 };
  }

  // Upsert: increment or insert
  await db
    .prepare(
      `INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)
       ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1`,
    )
    .bind(key, window)
    .run();

  return { allowed: true, remaining: limit - current - 1 };
}

export async function cleanupExpiredRateLimits(db: D1Database): Promise<void> {
  // Delete windows older than 2 hours ago
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString().slice(0, 13);
  await db.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(cutoff).run();
}
