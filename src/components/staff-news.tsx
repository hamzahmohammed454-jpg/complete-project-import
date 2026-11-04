import { useQuery } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { announcementIsCurrent } from "@/lib/announcements";

export function StaffNews() {
  const query = useQuery({ queryKey: ["staff-announcements"], refetchInterval: 60_000, queryFn: async () => {
    const { data, error } = await supabase.from("staff_announcements").select("*").eq("active", true).order("created_at", { ascending: false });
    if (error) throw error;
    return data.filter((row) => announcementIsCurrent(row, new Date()));
  } });
  if (!query.data?.length) return null;
  return <section aria-label="أخبار الموظفين" className="border-b border-border bg-secondary px-4 py-2 text-secondary-foreground print:hidden">
    <div className="mx-auto flex max-w-screen-xl items-start gap-3"><Megaphone className="mt-1 size-4 shrink-0" /><div className="min-w-0 space-y-2">
      {query.data.map((row) => <div key={row.id}><p className="text-sm font-semibold break-words">{row.title}</p><p className="whitespace-pre-wrap break-words text-xs leading-relaxed">{row.body}</p></div>)}
    </div></div>
  </section>;
}