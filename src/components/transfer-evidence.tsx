import { confirmOperation } from "@/lib/operation-confirmation";
import { confirmAsk } from "@/components/confirm-dialog";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Trash2, Image } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { useScreenPermissions } from "@/hooks/use-screen-permissions";
import { useAppRoles } from "@/hooks/use-app-roles";
import { evidenceIsValid } from "@/lib/evidence";
import { IS_LOCAL_APP } from "@/lib/local-mode";

export function TransferEvidence({ direction, id }: { direction: "incoming" | "outgoing"; id: number }) {
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const qc = useQueryClient();
  const permissions = useScreenPermissions("/transfers");
  const { isManager, roles } = useAppRoles();
  const canUpload = permissions.can("update") && permissions.can("evidence") && roles.some((role) => ["admin", "manager", "teller"].includes(role));
  const folder = `${direction}/${id}`;
  const query = useQuery({ queryKey: ["transfer-evidence", folder], enabled: open, queryFn: async () => {
    const { data, error } = await supabase.storage.from("transfer-evidence").list(folder, { limit: 100 });
    if (error) throw error; return data.filter((file) => file.id);
  } });
  const upload = useMutation({ mutationFn: async (file: File) => {
    if (!evidenceIsValid(file)) throw new Error("INVALID_IMAGE");
    const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
    const { error } = await supabase.storage.from("transfer-evidence").upload(`${folder}/${crypto.randomUUID()}.${extension}`, file, { contentType: file.type, upsert: false });
    if (error) throw error;
  }, onSuccess: () => { qc.invalidateQueries({ queryKey: ["transfer-evidence", folder] }); toast.success("أُرفقت الصورة"); }, onError: (e: Error) => toast.error(e.message === "INVALID_IMAGE" ? "اختر صورة JPG أو PNG أو WEBP لا تتجاوز 5 ميجابايت" : "تعذّر إرفاق الصورة") });
  const remove = useMutation({ mutationFn: async (name: string) => { const { error } = await supabase.storage.from("transfer-evidence").remove([`${folder}/${name}`]); if (error) throw error; }, onSuccess: () => { setImage(null); qc.invalidateQueries({ queryKey: ["transfer-evidence", folder] }); }, onError: () => toast.error("تعذّر حذف الصورة") });
  async function show(name: string) {
    if (IS_LOCAL_APP) {
      // Phone app: images live in the phone database, shown from memory.
      const { data, error } = await supabase.storage.from("transfer-evidence").download(`${folder}/${name}`);
      if (error || !data) { toast.error("تعذّر فتح الصورة"); return; }
      setImage(URL.createObjectURL(data));
      return;
    }
    const { data, error } = await supabase.storage.from("transfer-evidence").createSignedUrl(`${folder}/${name}`, 120);
    if (error) { toast.error("تعذّر فتح الصورة"); return; }
    setImage(data.signedUrl);
  }
  return <div className="mt-3 border-t border-border pt-2"><Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}><Image className="size-4" />مرفقات الحوالة</Button>
    {open && <div className="mt-2 space-y-3">{canUpload && <label className="flex cursor-pointer items-center gap-2 text-xs text-primary"><ImagePlus className="size-4" />إرفاق صورة<input aria-label={`إرفاق صورة للحوالة ${id}`} type="file" accept="image/jpeg,image/png,image/webp" disabled={upload.isPending} className="min-w-0 max-w-full text-xs" onChange={(e) => { const file = e.target.files?.[0]; if (file) confirmOperation("إرفاق صورة الحوالة", () => upload.mutate(file)); e.target.value = ""; }} /></label>}
      {query.isError ? <Notice tone="danger">تعذّر تحميل المرفقات.</Notice> : <ul className="flex flex-wrap gap-2">{query.data?.map((file, index) => <li key={file.id} className="flex items-center gap-1"><Button variant="outline" size="sm" onClick={() => show(file.name)}>صورة {index + 1}</Button>{isManager && permissions.can("delete") && <Button variant="ghost" size="icon" aria-label={`حذف الصورة ${index + 1}`} disabled={remove.isPending} onClick={async () => { if (await confirmAsk("حذف صورة الحوالة؟")) remove.mutate(file.name); }}><Trash2 className="size-4" /></Button>}</li>)}</ul>}
      {image && <img src={image} alt="مرفق الحوالة" className="max-h-96 w-full rounded-lg object-contain" />}
    </div>}
  </div>;
}