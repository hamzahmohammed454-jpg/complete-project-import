import { useRef, useState } from "react";
import { confirmAsk } from "@/components/confirm-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, Upload, Download, X } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { previewCustomerImport, type CustomerImportRow } from "@/lib/customer-import";
import { supabase } from "@/integrations/supabase/client";
import { useScreenPermissions } from "@/hooks/use-screen-permissions";
import { downloadBlob } from "@/lib/download";
import { xlsxBlob } from "@/lib/statement-xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, Notice, Td, Tr } from "@/components/ui-kit";
export function CustomerImport() {
  const input = useRef<HTMLInputElement>(null);
  const qc = useQueryClient(); const permissions = useScreenPermissions("/customers");
  const [open, setOpen] = useState(false); const [rows, setRows] = useState<CustomerImportRow[]>([]);
  const [reviewed, setReviewed] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function load(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError(""); setReviewed(false); setRows([]);
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("حجم الملف أكبر من 2 ميجابايت");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", sheetRows: 1002, raw: true });
      const sheetName = wb.SheetNames[0]; const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
      if (!sheet) throw new Error("الملف لا يحتوي على ورقة بيانات");
      const values = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
      if (values.length > 1001) throw new Error("الحد 1000 عميل في الملف الواحد");
      setRows(previewCustomerImport(values, values.slice(1).map(() => crypto.randomUUID())));
    } catch (e) { setError(e instanceof Error ? e.message : "تعذّر قراءة الملف"); } finally { setBusy(false); }
  }
  function template() {
    const wb = XLSX.utils.book_new(); const ws = XLSX.utils.aoa_to_sheet([["الاسم الكامل", "رقم الهاتف"]]);
    XLSX.utils.book_append_sheet(wb, ws, "العملاء"); wb.Workbook = { Views: [{ RTL: true }] };
    downloadBlob(xlsxBlob(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer), "نموذج العملاء.xlsx");
  }
  async function save() {
    if (!permissions.can("create") || !permissions.can("import") || !rows.length || rows.some((r) => r.issues.length) || !reviewed) return;
    if (!navigator.onLine) { setError("استيراد العملاء يحتاج اتصالًا بالإنترنت"); return; }
    if (!await confirmAsk(`تأكيد استيراد ${rows.length} عميل؟`)) return;
    setBusy(true); setError(""); const completed = new Set<string>();
    try {
      for (const row of rows) {
        const r = await supabase.from("customers").insert({ the_user_id: null, full_name: row.full_name, phone_number: row.phone_number || null, client_ref: row.client_ref }).select("id,client_ref");
        if (r.error) {
          if (r.error.code !== "23505" || !r.error.message.includes("client_ref")) throw new Error(`السطر ${row.row}: ${r.error.message}`);
          const existing = await supabase.from("customers").select("id").eq("client_ref", row.client_ref).maybeSingle();
          if (existing.error || !existing.data) throw new Error(`تعذّر تأكيد السطر ${row.row}`);
        } else if (!r.data?.length) throw new Error(`لم يُحفظ السطر ${row.row}`);
        completed.add(row.client_ref);
      }
      toast.success(`أُضيف ${completed.size} عميل`);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذّر الاستيراد"); }
    finally { setRows((current) => current.filter((r) => !completed.has(r.client_ref))); await qc.invalidateQueries({ queryKey: ["customers"] }); await qc.invalidateQueries({ queryKey: ["accounts"] }); setBusy(false); }
  }
  if (!permissions.can("create") || !permissions.can("import")) return null;
  return <section className="mb-4 space-y-3">
    <Button variant="outline" disabled={busy} onClick={() => setOpen((v) => !v)}><FileSpreadsheet className="size-4" />{open ? "إغلاق الاستيراد" : "استيراد العملاء"}</Button>
    {open && <><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => input.current?.click()}><Upload className="size-4" />اختيار ملف Excel</Button><Button variant="ghost" onClick={template}><Download className="size-4" />نموذج العملاء</Button></div><input ref={input} aria-label="ملف العملاء" type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => void load(e.target.files?.[0])} />
    {error && <Notice tone="danger">{error}</Notice>}
    {rows.length > 0 && <><p className="text-sm">{rows.length} عميل · أسماء وهواتف فقط</p><DataTable head={["السطر", "الاسم", "الهاتف", "المراجعة", ""]}>{rows.map((r) => <Tr key={r.client_ref}><Td money>{r.row}</Td><Td><Input aria-label={`اسم السطر ${r.row}`} disabled={busy} value={r.full_name} onChange={(e) => { const value = e.target.value; setReviewed(false); setRows((current) => current.map((x) => x.client_ref === r.client_ref ? { ...x, full_name: value, issues: x.issues.filter((v) => v !== "الاسم مطلوب").concat(value.trim() ? [] : ["الاسم مطلوب"]) } : x)); }} /></Td><Td money>{r.phone_number || "—"}</Td><Td><p className="text-xs text-destructive">{r.issues.join(" · ")}</p><p className="text-xs text-muted-foreground">{r.warnings.join(" · ")}</p></Td><Td><Button variant="ghost" size="icon" aria-label={`استبعاد السطر ${r.row}`} disabled={busy} onClick={() => setRows((current) => current.filter((x) => x.client_ref !== r.client_ref))}><X className="size-4" /></Button></Td></Tr>)}</DataTable><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reviewed} disabled={busy} onChange={(e) => setReviewed(e.target.checked)} />راجعت الأسماء وأرقام الهواتف</label><Button onClick={save} disabled={busy || !reviewed || rows.some((r) => r.issues.length)}><Upload className="size-4" />{busy ? "جارٍ الاستيراد" : "حفظ العملاء"}</Button></>}
    </>}
  </section>;
}