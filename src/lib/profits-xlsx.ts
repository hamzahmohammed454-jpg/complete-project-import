import * as XLSX from "xlsx";

export type ProfitCurrencyLine = { currency: string; count: number; amount: number; commission: number };
export type ProfitAgentLine = { agent: string; currency: string; commission: number };

export type ProfitsXlsxInput = {
  period: string; // «من 2026-10-01 حتى 2026-10-26»
  exchange: ProfitCurrencyLine[]; // أرباح الصرافة (بيع + شراء)
  transfers: ProfitCurrencyLine[]; // عمولات الحوالات
  agents: ProfitAgentLine[]; // عمولات الوكلاء
  spreads?: { pair: string; buyAmount: number; sellAmount: number; buyRate: number | null; sellRate: number | null; rateDifference: number | null; indicativeSpread: number | null }[];
};

/** تقرير الأرباح بصيغة Excel: ثلاثة أقسام في ورقة واحدة باتجاه عربي. */
export function profitsToArrayBuffer(input: ProfitsXlsxInput): ArrayBuffer {
  const aoa: (string | number)[][] = [
    ["تقرير الأرباح"],
    [`الفترة: ${input.period}`],
    [],
    ["عمولات البيع والشراء (بعملة القيمة)"],
    ["العملة", "عدد العمليات", "إجمالي المبالغ", "العمولات"],
    ...input.exchange.map((r) => [r.currency, r.count, r.amount, r.commission] as (string | number)[]),
    [],
    ["عمولات الحوالات"],
    ["العملة", "عدد الحوالات", "إجمالي المبالغ", "العمولات"],
    ...input.transfers.map((r) => [r.currency, r.count, r.amount, r.commission] as (string | number)[]),
    [],
    ["عمولات الوكلاء"],
    ["الوكيل", "العملة", "العمولة"],
    ...input.agents.map((r) => [r.agent, r.currency, r.commission] as (string | number)[]),
    [],
    ["فوارق البيع والشراء التقديرية — ليست أرباحاً محققة"],
    ["زوج العملات", "كمية الشراء", "كمية البيع", "متوسط الشراء", "متوسط البيع", "فارق السعر", "الفارق التقديري"],
    ...(input.spreads ?? []).map((r) => [r.pair, r.buyAmount, r.sellAmount, r.buyRate ?? "—", r.sellRate ?? "—", r.rateDifference ?? "—", r.indicativeSpread ?? "—"]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "الأرباح");
  wb.Workbook = { Views: [{ RTL: true }] };
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

export function profitsFilename(until: string): string {
  return `تقرير الأرباح - ${until}.xlsx`;
}
