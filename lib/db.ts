import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "forinvest.db");

const INITIAL_CASH_KRW = 10_000_000;
const INITIAL_CASH_USD = 10_000;

export const INITIAL_CASH = {
  KRW: INITIAL_CASH_KRW,
  USD: INITIAL_CASH_USD,
} as const;

const SCHEMA_VERSION = 3;

declare global {
  var __forinvestDb: DatabaseSync | undefined;
  var __forinvestSchemaV: number | undefined;
}

function init(db: DatabaseSync) {
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      cash_krw REAL NOT NULL,
      cash_usd REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS holdings (
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      market TEXT NOT NULL,
      currency TEXT NOT NULL,
      quantity REAL NOT NULL,
      avg_cost REAL NOT NULL,
      PRIMARY KEY (account_id, symbol)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      side TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
      quantity REAL NOT NULL,
      price REAL NOT NULL,
      currency TEXT NOT NULL,
      total REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS favorites (
      symbol TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      market TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 접속자 IP 로그 (관리자 페이지에서 조회/다운로드)
    CREATE TABLE IF NOT EXISTS access_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL,
      path TEXT,
      method TEXT,
      user_agent TEXT,
      referer TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_access_logs_created ON access_logs(created_at);
  `);

  const row = db.prepare("SELECT COUNT(*) AS c FROM accounts").get() as { c: number };
  if (row.c === 0) {
    db.prepare(
      "INSERT INTO accounts (name, cash_krw, cash_usd) VALUES (?, ?, ?)"
    ).run("모의 투자 계좌", INITIAL_CASH_KRW, INITIAL_CASH_USD);
  }
}

export function getDb(): DatabaseSync {
  if (!global.__forinvestDb) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    global.__forinvestDb = new DatabaseSync(DB_PATH);
  }
  if (global.__forinvestSchemaV !== SCHEMA_VERSION) {
    init(global.__forinvestDb);
    global.__forinvestSchemaV = SCHEMA_VERSION;
  }
  return global.__forinvestDb;
}

export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function resetAccount(accountId: number) {
  const db = getDb();
  withTransaction(db, () => {
    db.prepare("DELETE FROM holdings WHERE account_id = ?").run(accountId);
    db.prepare("DELETE FROM transactions WHERE account_id = ?").run(accountId);
    db.prepare("UPDATE accounts SET cash_krw = ?, cash_usd = ? WHERE id = ?").run(
      INITIAL_CASH_KRW,
      INITIAL_CASH_USD,
      accountId
    );
  });
}
