/** العمليات التي تحتاج انتباهًا ومطابقة الوكلاء — قراءة فقط، كل عملة على حدة. */
export type OpenTransfer = {
  id: number; dir: "out" | "in"; the_date: string; amount: number; currency_id: number | null;
  agent_id: number | null; transfer_number: number | string | null; receiver_name: string | null;
};

export function daysOld(date: string, today: string): number {
  return Math.floor((Date.parse(today) - Date.parse(date)) / 86_400_000);
}

/** الحوالات المفتوحة الأقدم من الحد المسموح، الأقدم أولًا. */
export function staleTransfers(rows: readonly OpenTransfer[], today: string, maxDays: number) {
  return rows
    .map((r) => ({ ...r, age: daysOld(r.the_date, today) }))
    .filter((r) => r.age > maxDays)
    .sort((a, b) => b.age - a.age);
}

export type AgentLine = { agentId: number; currencyId: number; outCount: number; outAmount: number; inCount: number; inAmount: number };

/** ملخص مفتوح لكل وكيل ولكل عملة لمطابقته مع كشف الوكيل. */
export function agentReconciliation(rows: readonly OpenTransfer[]): AgentLine[] {
  const map = new Map<string, AgentLine>();
  for (const r of rows) {
    if (r.agent_id == null) continue;
    const cur = r.currency_id ?? 0;
    const k = `${r.agent_id}:${cur}`;
    const l = map.get(k) ?? { agentId: r.agent_id, currencyId: cur, outCount: 0, outAmount: 0, inCount: 0, inAmount: 0 };
    if (r.dir === "out") { l.outCount++; l.outAmount += Number(r.amount); } else { l.inCount++; l.inAmount += Number(r.amount); }
    map.set(k, l);
  }
  return [...map.values()].sort((a, b) => a.agentId - b.agentId || a.currencyId - b.currencyId);
}
