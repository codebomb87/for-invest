import { getDb, withTransaction } from "@/lib/db";
import { marketData } from "@/lib/market/yahoo";
import type {
  Account,
  Broker,
  Holding,
  OrderRequest,
  OrderResult,
  Transaction,
} from "@/lib/types";

// 모의 브로커: 시장가 주문을 현재 시세로 즉시 체결.
// 추후 실계좌 연동 시 동일한 Broker 인터페이스로 RealBroker를 구현하면 됨.

export class SimulatedBroker implements Broker {
  async getAccount(accountId: number): Promise<Account | null> {
    const row = getDb()
      .prepare("SELECT * FROM accounts WHERE id = ?")
      .get(accountId) as any;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      cashKRW: row.cash_krw,
      cashUSD: row.cash_usd,
      createdAt: row.created_at,
    };
  }

  async getHoldings(accountId: number): Promise<Holding[]> {
    const rows = getDb()
      .prepare("SELECT * FROM holdings WHERE account_id = ? ORDER BY symbol")
      .all(accountId) as any[];
    return rows.map((r) => ({
      symbol: r.symbol,
      name: r.name,
      market: r.market,
      currency: r.currency,
      quantity: r.quantity,
      avgCost: r.avg_cost,
    }));
  }

  async getTransactions(accountId: number, limit = 50): Promise<Transaction[]> {
    const rows = getDb()
      .prepare(
        "SELECT * FROM transactions WHERE account_id = ? ORDER BY id DESC LIMIT ?"
      )
      .all(accountId, limit) as any[];
    return rows.map((r) => ({
      id: r.id,
      accountId: r.account_id,
      symbol: r.symbol,
      name: r.name,
      side: r.side,
      quantity: r.quantity,
      price: r.price,
      currency: r.currency,
      total: r.total,
      createdAt: r.created_at,
    }));
  }

  async placeOrder(req: OrderRequest): Promise<OrderResult> {
    const { accountId, symbol, side } = req;
    const quantity = Math.floor(req.quantity);

    if (!symbol || quantity <= 0) {
      return { ok: false, message: "종목과 수량을 올바르게 입력하세요." };
    }

    // 1. 현재 시세 조회 (시장가 체결)
    let quote;
    try {
      quote = await marketData.getQuote(symbol);
    } catch {
      return { ok: false, message: `시세 조회 실패: ${symbol}` };
    }
    if (!quote.price || quote.price <= 0) {
      return { ok: false, message: "유효한 시세를 가져오지 못했습니다." };
    }

    const price = quote.price;
    const total = price * quantity;
    const cashCol = quote.currency === "KRW" ? "cash_krw" : "cash_usd";
    const db = getDb();

    const account = db
      .prepare("SELECT * FROM accounts WHERE id = ?")
      .get(accountId) as any;
    if (!account) return { ok: false, message: "계좌를 찾을 수 없습니다." };

    let transactionId = 0;

    try {
      withTransaction(db, () => {
        if (side === "BUY") {
          const cash = account[cashCol] as number;
          if (cash < total) {
            throw new Error(
              `잔액 부족: 필요 ${total.toLocaleString()} ${quote.currency}, 보유 ${cash.toLocaleString()} ${quote.currency}`
            );
          }
          db.prepare(
            `UPDATE accounts SET ${cashCol} = ${cashCol} - ? WHERE id = ?`
          ).run(total, accountId);

          const holding = db
            .prepare(
              "SELECT * FROM holdings WHERE account_id = ? AND symbol = ?"
            )
            .get(accountId, symbol) as any;

          if (holding) {
            const newQty = holding.quantity + quantity;
            const newAvg =
              (holding.avg_cost * holding.quantity + total) / newQty;
            db.prepare(
              "UPDATE holdings SET quantity = ?, avg_cost = ? WHERE account_id = ? AND symbol = ?"
            ).run(newQty, newAvg, accountId, symbol);
          } else {
            db.prepare(
              "INSERT INTO holdings (account_id, symbol, name, market, currency, quantity, avg_cost) VALUES (?,?,?,?,?,?,?)"
            ).run(
              accountId,
              symbol,
              quote.name,
              quote.market,
              quote.currency,
              quantity,
              price
            );
          }
        } else {
          // SELL
          const holding = db
            .prepare(
              "SELECT * FROM holdings WHERE account_id = ? AND symbol = ?"
            )
            .get(accountId, symbol) as any;
          if (!holding || holding.quantity < quantity) {
            throw new Error(
              `보유 수량 부족: 보유 ${holding?.quantity ?? 0}주, 매도 요청 ${quantity}주`
            );
          }
          db.prepare(
            `UPDATE accounts SET ${cashCol} = ${cashCol} + ? WHERE id = ?`
          ).run(total, accountId);

          const newQty = holding.quantity - quantity;
          if (newQty === 0) {
            db.prepare(
              "DELETE FROM holdings WHERE account_id = ? AND symbol = ?"
            ).run(accountId, symbol);
          } else {
            db.prepare(
              "UPDATE holdings SET quantity = ? WHERE account_id = ? AND symbol = ?"
            ).run(newQty, accountId, symbol);
          }
        }

        const info = db
          .prepare(
            "INSERT INTO transactions (account_id, symbol, name, side, quantity, price, currency, total) VALUES (?,?,?,?,?,?,?,?)"
          )
          .run(
            accountId,
            symbol,
            quote.name,
            side,
            quantity,
            price,
            quote.currency,
            total
          );
        transactionId = Number(info.lastInsertRowid);
      });
    } catch (e: any) {
      return { ok: false, message: e.message || "주문 처리 실패" };
    }

    return {
      ok: true,
      message: `${side === "BUY" ? "매수" : "매도"} 체결: ${quote.name} ${quantity}주 @ ${price.toLocaleString()} ${quote.currency}`,
      executedPrice: price,
      transactionId,
    };
  }
}

export const broker: Broker = new SimulatedBroker();
