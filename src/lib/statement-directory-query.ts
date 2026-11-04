import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { collectPages } from "@/lib/paginated-read";

export const statementDirectoryQuery = queryOptions({
  queryKey: ["statement-directory"],
  queryFn: async () => {
    const [accounts, groups] = await Promise.all([
      collectPages(async (from, until) => {
        const r = await supabase.from("accounts").select("id, account_number, father_number, account_name, account_type, group_id").order("account_number").range(from, until);
        if (r.error) throw r.error;
        return r.data;
      }),
      collectPages(async (from, until) => {
        const r = await supabase.from("account_groups").select("id, the_number, group_name").order("the_number").range(from, until);
        if (r.error) throw r.error;
        return r.data;
      }),
    ]);
    return { accounts, groups };
  },
});