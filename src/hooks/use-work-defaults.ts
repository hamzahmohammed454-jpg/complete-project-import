import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useWorkDefaults() {
  return useQuery({
    queryKey: ["my-work-defaults"],
    queryFn: async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) return null;
      const { data, error } = await supabase.from("staff_work_defaults").select("branch_id, box_id, currency_id, enforce_box, enforce_currency, allow_past_date, allow_future_date, allow_buy, allow_sell").eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}