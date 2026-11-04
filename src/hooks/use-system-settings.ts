import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkDefaults } from "@/hooks/use-work-defaults";
import { resolveSetting, type SettingRow, type SettingValue } from "@/lib/system-settings";

export function useSettingRows() {
  return useQuery({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("system_settings").select("scope, owner, key, value");
      if (error) throw error;
      return (data ?? []) as SettingRow[];
    },
  });
}

/** قيمة أي إعداد للموظف الحالي حسب فرعه وإعداداته الخاصة. */
export function useSystemSettings() {
  const { data: rows = [] } = useSettingRows();
  const { data: defaults } = useWorkDefaults();
  const { data: userId } = useQuery({ queryKey: ["me-id"], queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null });
  return (key: string): SettingValue => resolveSetting(key, rows, { userId: userId ?? null, branchId: defaults?.branch_id ?? null });
}
