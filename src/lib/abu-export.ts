// One-time export of the shared system's data for the separate offline "أبو الياس" phone app.
// Read-only: pages through every table the signed-in admin may read (RLS applies),
// plus document counters through an admin-only read RPC. Nothing is written.
import { supabase } from "@/integrations/supabase/client";
import { collectPages } from "@/lib/paginated-read";

/** Tables copied to the phone. Sessions, licensing and probe tables stay in the cloud. */
export const ABU_EXPORT_TABLES = [
  "account_groups", "accounts", "activity_log", "agent_settlements", "agents", "areas", "auto_reply_commands",
  "auto_reply_settings", "bank_accounts", "banks", "blacklist", "box_closings", "box_movements", "boxes", "branches",
  "buy_currencies", "cash_vouchers", "check_books", "checks", "classifications", "commission_rules", "cost_centers",
  "countries", "currencies", "currency_prices", "currency_rate_history", "customer_transfer_movements", "customers",
  "entries", "entries_details", "financial_years", "forbidden_texts", "funds_inventory", "funds_inventory_details",
  "governorates", "group_screen_permissions", "incoming_transfers", "inventory_postings", "journal_vouchers",
  "loop_entries", "loop_entries_details", "loop_entries_runs", "outgoing_transfers", "period_closings", "profiles",
  "receiver_cards", "sell_currencies", "staff_announcements", "staff_work_defaults", "system_settings",
  "transfer_entities", "transfer_purposes", "transfer_requests", "user_group_members", "user_groups", "user_roles",
  "user_screen_permissions", "withdrawal_requests",
] as const;

const ORDER_KEY: Record<string, string> = { auto_reply_commands: "code", staff_work_defaults: "user_id" };

export type AbuSeed = { format: "abu-elyas-seed"; version: 1; created_at: string; tables: Record<string, Record<string, unknown>[]> };

export async function buildAbuSeed(onProgress?: (done: number, total: number) => void): Promise<AbuSeed> {
  const tables: AbuSeed["tables"] = {};
  const total = ABU_EXPORT_TABLES.length + 1;
  let done = 0;
  for (const table of ABU_EXPORT_TABLES) {
    tables[table] = await collectPages(async (from, until) => {
      const { data, error } = await supabase.from(table as never).select("*").order(ORDER_KEY[table] ?? "id").range(from, until);
      if (error) throw new Error(`تعذّر نسخ ${table}: ${error.message}`);
      return (data ?? []) as Record<string, unknown>[];
    });
    onProgress?.(++done, total);
  }
  const { data, error } = await supabase.rpc("export_document_numbering" as never);
  if (error) throw new Error(`تعذّر نسخ عدادات الأرقام: ${error.message}`);
  const numbering = (data ?? {}) as Record<string, Record<string, unknown>[]>;
  tables["document_counters"] = numbering["document_counters"] ?? [];
  tables["document_number_registry"] = numbering["document_number_registry"] ?? [];
  onProgress?.(++done, total);
  return { format: "abu-elyas-seed", version: 1, created_at: new Date().toISOString(), tables };
}
