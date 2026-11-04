/** أزرار العمليات الخاصة لكل شاشة؛ كل زر له مربع مستقل في صلاحيات المجموعة. */
export type ScreenAction = { key: string; label: string };

export const SCREEN_ACTIONS: Record<string, readonly ScreenAction[]> = {
  "/transfers": [
    { key: "deliver", label: "تسليم الحوالة" },
    { key: "cancel", label: "إلغاء الحوالة" },
    { key: "export", label: "تصدير للوكيل" },
    { key: "whatsapp", label: "إشعار واتساب" },
    { key: "evidence", label: "مرفقات الصور" },
  ],
  "/checks": [
    { key: "collect", label: "تحصيل الشيك" },
    { key: "bounce", label: "إرجاع الشيك" },
  ],
  "/closing": [
    { key: "close", label: "إقفال الصندوق" },
    { key: "reopen", label: "إعادة فتح الصندوق" },
  ],
  "/statement": [
    { key: "excel", label: "تنزيل Excel" },
    { key: "pdf", label: "حفظ PDF" },
  ],
  "/daily-report": [{ key: "excel", label: "تنزيل Excel" }],
  "/customers": [{ key: "import", label: "استيراد من Excel" }],
};

export function screenActions(path: string): readonly ScreenAction[] {
  return SCREEN_ACTIONS[path] ?? [];
}
