/** يحوّل رقمًا يمنيًا محليًا إلى صيغة دولية ويبني رابط wa.me؛ يعيد null للرقم غير الصالح. */
export function normalizeYemenPhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  if (/^7\d{8}$/.test(d)) d = `967${d}`;
  return /^\d{9,15}$/.test(d) ? d : null;
}

export function waLink(phone: string, text: string): string | null {
  const n = normalizeYemenPhone(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}
