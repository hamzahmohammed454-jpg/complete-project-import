import { useQuery } from "@tanstack/react-query";

import { SCREENS, screenAllowed } from "@/lib/screen-access";
import { useAppRoles } from "@/hooks/use-app-roles";
import { supabase } from "@/integrations/supabase/client";
import { useOfflineStatus } from "@/hooks/use-offline-status";

/** الشاشات المسموح بها للموظف الحالي، من مجموعاته في جدول مجموعات الموظفين. */
export function useScreenAccess() {
  const { online } = useOfflineStatus();
  const { roles, isLoading: rolesLoading } = useAppRoles();

  const query = useQuery({
    queryKey: ["screen-access"],
    enabled: online,
    queryFn: async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) return [] as string[];
      const paths = [...SCREENS.map((screen) => screen.to), "/administration"];
      const values = await Promise.all(paths.map(async (path) => {
        const { data, error } = await supabase.rpc("has_screen_permission", { p_screen: path, p_action: "view" });
        if (error) throw error;
        return data ? path : null;
      }));
      return values.filter((path): path is string => path !== null);
    },
  });

  const allowed = query.data ?? [];
  return {
    ...query,
    roles,
    allowed,
    isLoading: rolesLoading || query.isLoading,
    canSee: (path: string) => path === "/app" || (!rolesLoading && !query.isLoading && !query.isError && allowed.includes(path) && screenAllowed(path, allowed, roles)),
  };
}
