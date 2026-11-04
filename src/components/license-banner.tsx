import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LicenseStatus } from "@/lib/license";
import { useAppRoles } from "@/hooks/use-app-roles";
export function LicenseBanner() {
  const { isAdmin } = useAppRoles();
  const query = useQuery({ queryKey: ["license-status"], refetchInterval: 60_000, queryFn: async () => {
    const { data, error } = await supabase.rpc("license_status"); if (error) throw error; return data as unknown as LicenseStatus;
  } });
  if (!query.data || query.data.can_write) return null;
  const date = new Intl.DateTimeFormat("ar", { timeZone: "Asia/Aden", year: "numeric", month: "short", day: "numeric" }).format(new Date(query.data.trial_ends_at));
  return <div className="border-b border-border bg-secondary px-4 py-2 text-sm text-secondary-foreground print:hidden"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2"><span>{query.data.can_write ? `التجربة حتى ${date}` : "انتهت صلاحية التسجيل؛ البيانات متاحة للقراءة والطباعة"}</span>{isAdmin && <Link to="/license" className="font-semibold text-primary underline underline-offset-4">التفعيل</Link>}</div></div>;
}