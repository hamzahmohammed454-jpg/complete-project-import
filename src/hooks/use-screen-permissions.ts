import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { screenActions } from "@/lib/screen-actions";
import { useOfflineStatus } from "@/hooks/use-offline-status";

export function useScreenPermissions(path: string) {
  const { online } = useOfflineStatus();
  const query = useQuery({
    queryKey: ["screen-permissions", path],
    enabled: online,
    queryFn: async () => {
      const actions = ["view", "create", "update", "delete", "print", ...screenActions(path).map((a) => a.key)];
      const values = await Promise.all(actions.map(async (action) => {
        const { data, error } = await supabase.rpc("has_screen_permission", { p_screen: path, p_action: action });
        if (error) throw error;
        return [action, data === true] as const;
      }));
      return Object.fromEntries(values) as Record<string, boolean>;
    },
  });
  return { ...query, can: (action: string) => query.data?.[action] === true };
}
