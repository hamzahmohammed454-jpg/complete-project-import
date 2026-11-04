import { useQuery } from "@tanstack/react-query";

import {
  canCloseBoxes,
  canDeleteCustomers,
  canManageAccounts,
  canManageCommissions,
  canRecordSettlements,
  isAdmin,
  isManager,
} from "@/lib/roles";
import { supabase } from "@/integrations/supabase/client";
import { useOfflineStatus } from "@/hooks/use-offline-status";

/** Reads the signed-in staff member's own roles from public.user_roles (RLS allows self-read). */
export function useAppRoles() {
  const { online } = useOfflineStatus();
  const query = useQuery({
    queryKey: ["app_roles"],
    enabled: online,
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [] as string[];
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      if (error) throw error;
      return (data ?? []).map((row) => row.role as string);
    },
  });

  const roles = query.data ?? [];
  return {
    ...query,
    roles,
    canManageCommissions: canManageCommissions(roles),
    isManager: isManager(roles),
    isAdmin: isAdmin(roles),
    canManageAccounts: canManageAccounts(roles),
    canDeleteCustomers: canDeleteCustomers(roles),
    canRecordSettlements: canRecordSettlements(roles),
    canCloseBoxes: canCloseBoxes(roles),
  };
}
