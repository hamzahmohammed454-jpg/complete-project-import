export type AppPrefs = {
  fontSize: "small" | "normal" | "large";
  autoPrint: boolean;
  waShowNumber: boolean;
  waShowBalance: boolean;
  waShowDate: boolean;
  waShowShop: boolean;
  waHeader: string;
  waFooter: string;
  voucherTpl: "classic" | "table" | "rounded" | "compact" | "bare";
  /** لون الجدول والعناوين */
  voucherColor: string;
  /** حجم خط السند بالنسبة المئوية */
  voucherFont: number;
  /** عائلة خط السند؛ الفارغ يعني خط النظام */
  voucherFontFamily: "" | "Tajawal" | "Rubik" | "Cairo";
  voucherBold: boolean;
  /** لون خط السند */
  voucherTextColor: string;
  /** درجة تظليل خلايا الجدول 0–40 */
  voucherShade: number;
  /** استخدام اسم السند (قبض/صرف) بدلًا من مدين/دائن في العنوان */
  useVoucherNameTitle: boolean;
  noticeShowAccount: boolean;
  noticeShowFee: boolean;
  noticeShowWords: boolean;
  noticeShowNarrative: boolean;
  noticeCreditIntro: string;
  noticeDebitIntro: string;
  noticeNote: string;
};

export const DEFAULT_PREFS: AppPrefs = { fontSize: "normal", autoPrint: false, waShowNumber: true, waShowBalance: true, waShowDate: true, waShowShop: true, waHeader: "", waFooter: "", voucherTpl: "classic", voucherColor: "", voucherFont: 100, voucherFontFamily: "", voucherBold: false, voucherTextColor: "", voucherShade: 0, useVoucherNameTitle: false, noticeShowAccount: true, noticeShowFee: true, noticeShowWords: true, noticeShowNarrative: true, noticeCreditIntro: "", noticeDebitIntro: "", noticeNote: "" };
const KEY = "abutaha-prefs";

export function loadPrefs(): AppPrefs {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return DEFAULT_PREFS; }
}

export function applyFontSize(size: AppPrefs["fontSize"]) {
  document.documentElement.style.fontSize = size === "small" ? "14px" : size === "large" ? "18px" : "";
}

export function savePrefs(p: AppPrefs) {
  localStorage.setItem(KEY, JSON.stringify(p));
  applyFontSize(p.fontSize);
  applyVoucherTpl(p);
}

function setOrRemove(el: HTMLElement, name: string, value: string) {
  if (value) el.style.setProperty(name, value); else el.style.removeProperty(name);
}

export function applyVoucherTpl(p: AppPrefs) {
  const el = document.documentElement;
  el.setAttribute("data-voucher-tpl", p.voucherTpl);
  el.setAttribute("data-voucher-bold", p.voucherBold ? "true" : "false");
  setOrRemove(el, "--voucher-accent", p.voucherColor);
  setOrRemove(el, "--voucher-text", p.voucherTextColor);
  setOrRemove(el, "--voucher-font-family", p.voucherFontFamily);
  el.style.setProperty("--voucher-font", `${p.voucherFont}%`);
  el.style.setProperty("--voucher-shade", `${Math.max(0, Math.min(40, p.voucherShade))}%`);
}
