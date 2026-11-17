// Gallring av personuppgifter som inte längre behövs (SEC-27). Körs av soparen i app.js.
const DAY = 86400_000;

export function purgeExpired(db, { sessionsDays = 30, moderationDays = 365, reportsDays = 365 } = {}) {
  const now = Date.now();
  const iso = (days) => new Date(now - days * DAY).toISOString();
  const r = {
    sessions: db.prepare('DELETE FROM sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)')
      .run(iso(sessionsDays), iso(sessionsDays)).changes,
    retired: db.prepare('DELETE FROM retired_usernames WHERE until < ?').run(new Date(now).toISOString()).changes,
    moderation: db.prepare('DELETE FROM moderation_log WHERE created_at < ?').run(iso(moderationDays)).changes,
    reports: db.prepare("DELETE FROM reports WHERE status <> 'open' AND resolved_at < ?").run(iso(reportsDays)).changes,
  };
  return r;
}
