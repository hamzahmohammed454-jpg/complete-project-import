const UNITS = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
const TEENS = [
  "عشرة",
  "أحد عشر",
  "اثنا عشر",
  "ثلاثة عشر",
  "أربعة عشر",
  "خمسة عشر",
  "ستة عشر",
  "سبعة عشر",
  "ثمانية عشر",
  "تسعة عشر",
];
const TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const HUNDREDS = [
  "",
  "مئة",
  "مئتان",
  "ثلاثمئة",
  "أربعمئة",
  "خمسمئة",
  "ستمئة",
  "سبعمئة",
  "ثمانمئة",
  "تسعمئة",
];

const SCALES = [
  { value: 1_000_000, one: "مليون", two: "مليونان", few: "ملايين", many: "مليون" },
  { value: 1_000, one: "ألف", two: "ألفان", few: "آلاف", many: "ألف" },
];

function at(list: readonly string[], index: number): string {
  return list[index] ?? "";
}

function wordsUnder1000(n: number): string[] {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) parts.push(at(HUNDREDS, hundreds));
  if (rest) {
    if (rest < 10) parts.push(at(UNITS, rest));
    else if (rest < 20) parts.push(at(TEENS, rest - 10));
    else {
      const tens = Math.floor(rest / 10);
      const unit = rest % 10;
      parts.push(unit ? `${at(UNITS, unit)} و${at(TENS, tens)}` : at(TENS, tens));
    }
  }
  return parts;
}

/** تفقيط مبلغ بالريال/الدولار إلى كلمات عربية (أجزاء من مئة للكسور). */
export function tafeesh(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "صفر";
  const parts: string[] = [];
  let rest = Math.floor(amount);
  for (const scale of SCALES) {
    const group = Math.floor(rest / scale.value);
    rest = rest % scale.value;
    if (!group) continue;
    if (group === 1) parts.push(scale.one);
    else if (group === 2) parts.push(scale.two);
    else if (group <= 10) parts.push(`${wordsUnder1000(group).join(" و ")} ${scale.few}`);
    else parts.push(`${wordsUnder1000(group).join(" و ")} ${scale.many}`);
  }
  if (rest) parts.push(wordsUnder1000(rest).join(" و "));
  return parts.join(" و ");
}

/** المبلغ بالحروف مع الكسر «من مئة» واسم العملة. */
export function amountWords(amount: number, currencyName: string): string {
  const abs = Math.abs(amount);
  const integer = Math.floor(abs);
  const fraction = Math.round((abs - integer) * 100);
  let text = tafeesh(integer);
  if (fraction > 0) text += ` و ${tafeesh(fraction)} من مئة`;
  return `${text} ${currencyName}`.trim();
}

/** صيغة السند الرسمية: «فقط وقدره … لا غير». */
export function amountInWords(amount: number, currencyName: string): string {
  return `فقط وقدره ${amountWords(amount, currencyName)} لا غير`;
}
