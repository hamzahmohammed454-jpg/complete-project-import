import { fmt } from "@/lib/money";

/**
 * رابط واتساب مباشر (click-to-chat) لإشعار العميل — بلا خادم ولا اشتراك.
 * يطبّع أرقام اليمن: 7XXXXXXXX تصبح 9677XXXXXXXX.
 */
export function whatsAppLink(phone: string, text: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9 && digits.startsWith("7")) digits = "967" + digits;
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export type WaPrefs = { waShowBalance: boolean; waShowDate: boolean; waShowShop: boolean; waHeader?: string; waFooter?: string };

/** يطبّق خيارات الضبط على نص الرسالة: إخفاء التاريخ/الرصيد وإضافة اسم المحل. */
export function applyWaPrefs(text: string, p: WaPrefs): string {
  let lines = text.split("\n");
  if (!p.waShowDate) lines = lines.filter((l) => !/^(حتى يوم|من \d)/.test(l));
  if (!p.waShowBalance) lines = lines.filter((l) => !/الرصيد/.test(l));
  if (p.waHeader?.trim()) lines.unshift(p.waHeader.trim());
  if (p.waFooter?.trim()) lines.push(p.waFooter.trim());
  if (p.waShowShop) lines.push("ابو طه للصرافة والتحويلات المالية");
  return lines.join("\n");
}

function readWaPrefs(): WaPrefs | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const saved = localStorage.getItem("abutaha-prefs");
    if (!saved) return null;
    const p = JSON.parse(saved);
    return { waShowBalance: p.waShowBalance ?? true, waShowDate: p.waShowDate ?? true, waShowShop: p.waShowShop ?? true, waHeader: p.waHeader ?? "", waFooter: p.waFooter ?? "" };
  } catch { return null; }
}

/** رابط واتساب لرقم الطرف إن وُجد، وإلا رابط عام يختار فيه الموظف جهة الإرسال. */
export function waLinkOrPicker(phone: string | null | undefined, raw: string): string {
  const prefs = readWaPrefs();
  const text = prefs ? applyWaPrefs(raw, prefs) : raw;
  return (phone && whatsAppLink(phone, text)) || `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** رسالة الرصيد الجاهزة: «الرصيد لكم/عليكم» حتى يوم معيّن. */
export function waBalanceText(party: string, sentence: string, until: string): string {
  return [`السيد/ ${party}`, sentence, `حتى يوم ${until}`].join("\n");
}

export type WaSummaryRow = { currency: string; debit: number; credit: number };

/** رسالة الكشف الإجمالي: سطر لكل عملة بمدينها ودائنها، ثم جملة الصافي. */
export function waSummaryText(party: string, until: string, rows: readonly WaSummaryRow[], netSentence: string): string {
  const body = rows.map((r) => `${r.currency}: مدين ${fmt(r.debit)} / دائن ${fmt(r.credit)}`);
  return [`كشف حساب إجمالي — ${party}`, `حتى يوم ${until}`, ...body, netSentence].join("\n");
}

export type WaLine = { date: string; description: string; debit: number; credit: number; balance: number };

/** رسالة الكشف التفصيلي: الحركات سطرًا سطرًا. تُقتطع إلى آخر ٦٠ حركة حتى لا تطول الرسالة. */
export function waDetailText(
  party: string,
  from: string,
  until: string,
  lines: readonly WaLine[],
  sentence: string,
  maxLines = 60,
): string {
  const shown = lines.slice(-maxLines);
  const head = from ? `من ${from} إلى ${until}` : `حتى يوم ${until}`;
  const body = shown.map(
    (l) => `${l.date} — ${l.description}: مدين ${fmt(l.debit)} / دائن ${fmt(l.credit)} (الرصيد ${fmt(Math.abs(l.balance))})`,
  );
  const note = lines.length > shown.length ? `… تُعرض آخر ${shown.length} حركة فقط` : null;
  return [`كشف حساب تفصيلي — ${party}`, head, ...(note ? [note] : []), ...body, sentence].join("\n");
}

/** رسالة آخر عملية على الحساب. */
export function waLastOpText(party: string, op: WaLine | null): string {
  if (!op) return `السيد/ ${party}\nلا توجد عمليات مسجلة بعد.`;
  return [`آخر عملية — ${party}`, `${op.date} — ${op.description}`, `مدين ${fmt(op.debit)} / دائن ${fmt(op.credit)}`].join("\n");
}
