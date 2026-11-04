import { amountWords } from "@/lib/tafteesh";

/** تفقيط حي: يظهر المبلغ بالحروف أثناء الكتابة في نماذج المبالغ. */
export function LiveAmountWords({ amount, currencyName }: { amount: string; currencyName: string }) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0 || !currencyName) return null;
  return <p className="text-xs leading-relaxed text-muted-foreground">{amountWords(n, currencyName)}</p>;
}
