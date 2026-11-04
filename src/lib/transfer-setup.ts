/** مطابقة القائمة السوداء: اسم أو هاتف أو رقم هوية مطابق يرفع تنبيهًا في نموذج الحوالة. */
export type BlacklistRow = {
  full_name: string;
  identity_number: string | null;
  phone_number: string | null;
  reason: string | null;
};

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

/** أول سجل مطابق بالاسم أو الهاتف أو رقم الهوية، أو null إذا لم يكن هناك تطابق. */
export function blacklistMatch(
  name: string,
  phone: string,
  identity: string,
  rows: readonly BlacklistRow[],
): BlacklistRow | null {
  const target = normalizeName(name);
  const targetPhone = digitsOnly(phone);
  const targetIdentity = identity.trim();
  for (const row of rows) {
    if (target && normalizeName(row.full_name) === target) return row;
    const rowPhone = digitsOnly(row.phone_number ?? "");
    if (targetPhone && rowPhone && rowPhone === targetPhone) return row;
    const rowIdentity = (row.identity_number ?? "").trim();
    if (targetIdentity && rowIdentity && rowIdentity === targetIdentity) return row;
  }
  return null;
}

/** أول نص ممنوع يرد في أي من نصوص الحوالة (بلا تمييز حالة الأحرف)، أو null. */
export function forbiddenTextMatch(texts: readonly string[], forbidden: readonly string[]): string | null {
  const hay = texts.map((t) => t.toLowerCase()).join(" \n ");
  for (const word of forbidden) {
    const w = word.trim().toLowerCase();
    if (w && hay.includes(w)) return word.trim();
  }
  return null;
}
