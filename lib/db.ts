import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";

// Node 22.13+ 내장 SQLite (node:sqlite) 사용 — 네이티브 모듈 설치 불필요.
// 추후 실서비스 전환 시 Postgres 등으로 교체 가능하도록
// DB 접근은 이 모듈과 broker/simulated.ts 안에만 둔다.

// 배포 환경(서버리스 등)에서 쓰기 가능한 경로로 바꿀 수 있게 환경변수 지원
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "forinvest.db");

const INITIAL_CASH_KRW = 10_000_000; // 초기 모의 자금: 1천만 원
const INITIAL_CASH_USD = 10_000;     // 초기 모의 자금: $10,000

// 전체 손익 계산 기준 (초기 자금)
export const INITIAL_CASH = {
  KRW: INITIAL_CASH_KRW,
  USD: INITIAL_CASH_USD,
} as const;

// 스키마 변경 시 이 값을 올리면 핫리로드/재시작 시 init이 다시 실행됨
const SCHEMA_VERSION = 2;

declare global {
  // Next.js dev 모드의 핫 리로드 시 커넥션 중복 생성 방지
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
  `);

  // 기본 모의 계좌가 없으면 생성
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
  // 핫리로드로 코드가 갱신돼도 (기존 연결 재사용 시) 스키마 마이그레이션 보장
  if (global.__forinvestSchemaV !== SCHEMA_VERSION) {
    init(global.__forinvestDb);
    global.__forinvestSchemaV = SCHEMA_VERSION;
  }
  return global.__forinvestDb;
}

// 간단한 트랜잭션 헬퍼 (node:sqlite에는 transaction()이 없음)
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
