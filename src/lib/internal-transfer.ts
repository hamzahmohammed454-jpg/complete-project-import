/** جهة الفروع الداخلية الوحيدة؛ لا تُرسل إلى شبكة خارجية. */
export const MAIN_CENTER = "المركز الرئيسي";

export function isMainCenter(destination: string): boolean {
  return destination.trim() === MAIN_CENTER;
}