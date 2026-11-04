import { beforeEach, describe, expect, it } from "vitest";
import { applyDelete, applyInsert } from "@/lib/local/engine";
import { setTables, tableOf } from "@/lib/local/store";

// قاعدة المالك: البيع والشراء من الحساب يُخصم ويُضاف بالعملتين في كشف العميل (عليه = مدين، له = دائن)
const ctx = { uid: null };
const USD = 1;
const YER = 2;

beforeEach(() => {
  setTables({ customers: [{ id: 7, full_name: "عميل", account_id: 70 }] });
});

const op = { amount: 100, currency_id: USD, price: 530, exchange_amount: 53000, exchange_currency_id: YER, commission: 500, box_id: 3, the_date: "2026-10-28", payment_method: "account", customer_id: 7 };
const net = (currency: number) => tableOf("customer_transfer_movements").filter((m) => m["currency_id"] === currency).reduce((s, m) => s + Number(m["debit"]) - Number(m["credit"]), 0);

describe("buy/sell payment method", () => {
  it("buy from account: customer gets +100 USD and owes 53,000 + 500 YER", () => {
    applyInsert("buy_currencies", { ...op }, ctx);
    expect(net(USD)).toBe(-100);
    expect(net(YER)).toBe(53500);
  });

  it("sell from account: customer owes 100 USD and gets 53,000 YER less 500 commission", () => {
    applyInsert("sell_currencies", { ...op }, ctx);
    expect(net(USD)).toBe(100);
    expect(net(YER)).toBe(-52500);
  });

  it("account operation never touches the cash box", () => {
    const row = applyInsert("buy_currencies", { ...op }, ctx);
    expect(row["box_id"]).toBeNull();
    expect(tableOf("box_movements")).toHaveLength(0);
  });

  it("cash operation posts nothing to the customer statement", () => {
    applyInsert("sell_currencies", { ...op, payment_method: "cash", customer_id: null }, ctx);
    expect(tableOf("customer_transfer_movements")).toHaveLength(0);
    expect(tableOf("box_movements").length).toBeGreaterThan(0);
  });

  it("deleting an account operation reverses it to a zero balance", () => {
    const row = applyInsert("buy_currencies", { ...op }, ctx);
    applyDelete("buy_currencies", row, ctx);
    expect(net(USD)).toBe(0);
    expect(net(YER)).toBe(0);
  });

  it("account operation without a customer is refused", () => {
    expect(() => applyInsert("buy_currencies", { ...op, customer_id: null }, ctx)).toThrow("EXCHANGE_CUSTOMER_REQUIRED");
  });
});
