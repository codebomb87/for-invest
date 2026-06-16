import { getDb } from "@/lib/db";

const MAX_ROWS = Number(process.env.ACCESS_LOG_MAX ?? 50_000);
const RETENTION_DAYS = Number(process.env.ACCESS_LOG_RETENTION_DAYS ?? 0);

export interface AccessLogRow {
  id: number;
  ip: string;
  path: string | null;
  method: string | null;
  user_agent: string | null;
  referer: string | null;
  created_at: string;
}

interface LogInput {
  ip: string;
  path?: string;
  method?: string;
  userAgent?: string;
  referer?: string;
}

let writeCount = 0;

export function logAccess(input: LogInput): void {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO access_logs (ip, path, method, user_agent, referer)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      input.ip || "unknown",
      input.path ?? null,
      input.method ?? null,
      input.userAgent ?? null,
      input.referer ?? null
    );

    if (++writeCount % 200 === 0) {
      pruneLogs();
    }
  } catch {
    // 로깅 실패는 무시
  }
}

export function pruneLogs(): { deletedByAge: number; deletedByCount: number } {
  const db = getDb();
  let deletedByAge = 0;
  let deletedByCount = 0;

  if (RETENTION_DAYS > 0) {
    const r = db
      .prepare(`DELETE FROM access_logs WHERE created_at < datetime('now', ?)`)
      .run(`-${RETENTION_DAYS} days`);
    deletedByAge = Number(r.changes ?? 0);
  }

  if (MAX_ROWS > 0) {
    const r = db
      .prepare(
        `DELETE FROM access_logs
         WHERE id <= (
           SELECT id FROM access_logs ORDER BY id DESC LIMIT 1 OFFSET ?
         )`
      )
      .run(MAX_ROWS);
    deletedByCount = Number(r.changes ?? 0);
  }

  return { deletedByAge, deletedByCount };
}

export function recentLogs(limit = 100): AccessLogRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, ip, path, method, user_agent, referer,
              datetime(created_at, '+9 hours') AS created_at
       FROM access_logs ORDER BY id DESC LIMIT ?`
    )
    .all(Math.max(1, Math.min(limit, 10_000))) as unknown as AccessLogRow[];
}

export function countLogs(): number {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) AS c FROM access_logs").get() as {
    c: number;
  };
  return row.c;
}

export function logsToCsv(rows: AccessLogRow[]): string {
  const header = ["id", "ip", "path", "method", "user_agent", "referer", "created_at"];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [r.id, r.ip, r.path, r.method, r.user_agent, r.referer, r.created_at]
        .map(esc)
        .join(",")
    );
  }
  return lines.join("\n");
}
