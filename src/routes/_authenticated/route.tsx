import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { IS_LOCAL_APP } from "@/lib/local-mode";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // The offline phone app checks the account against the phone database itself.
    if (IS_LOCAL_APP) {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw redirect({ to: "/" });
      return;
    }
    const { installOfflineLayer } = await import("@/lib/offline/network");
    await installOfflineLayer();
    // Offline the server can't confirm the user, so trust the session saved on the device.
    if (!navigator.onLine) {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw redirect({ to: "/" });
      return;
    }
    const { data, error } = await supabase.auth.getUser();
    if (!data.user) {
      const { data: s } = await supabase.auth.getSession();
      if (error && s.session && /fetch|network/i.test(error.message)) return;
      throw redirect({ to: "/" });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
