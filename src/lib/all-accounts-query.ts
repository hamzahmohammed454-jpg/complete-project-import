import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { collectPages } from "./paginated-read";
import type { AllAccountsInput } from "./all-accounts";
async function loadAllAccounts(): Promise<AllAccountsInput> {
  const [cust, ag, v, ch, o, i, s, e, movements] = await Promise.all([
    collectPages(async (from, until) => { const r = await supabase.from("customers").select("id, the_user_id, full_name, account_id").order("id").range(from, until); if (r.error) throw r.error; return r.data; }),
    collectPages(async (from, until) => { const r = await supabase.from("agents").select("id, the_number, agent_name, account_id").order("id").range(from, until); if (r.error) throw r.error; return r.data; }),
    collectPages(async (from, until) => { const r = await supabase.from("cash_vouchers").select("customer_id, voucher_type, amount, currency_id, the_date").order("id").range(from, until); if (r.error) throw r.error; return r.data; }),
    collectPages(async (from, until) => { const r = await supabase.from("checks").select("customer_id, check_type, status, amount, currency_id, the_date, collected_date").order("id").range(from, until); if (r.error) throw r.error; return r.data; }),
    collectPages(async (from, until) => { const r = await supabase.from("outgoing_transfers").select("agent_id, amount, currency_id, the_date, canceled").order("id").range(from, until); if (r.error) throw r.error; return r.data; }),
    collectPages(async (from, until) => { const r = await supabase.from("incoming_transfers").select("agent_id, amount, currency_id, the_date, canceled").order("id").range(from, until); if (r.error) throw r.error; return r.data; }),
    collectPages(async (from, until) => { const r = await supabase.from("agent_settlements").select("agent_id, amount, currency_id, direction, the_date").order("id").range(from, until); if (r.error) throw r.error; return r.data; }),
    collectPages(async (from, until) => { const r = await supabase.from("entries_details").select("account_id, side, amount, currency_id, entries!inner(the_date)").eq("settlement_mirror", false).order("id").range(from, until); if (r.error) throw r.error; return r.data; }),
    collectPages(async (from, until) => { const r = await supabase.from("customer_transfer_movements").select("customer_id, currency_id, debit, credit, the_date").order("id").range(from, until); if (r.error) throw r.error; return r.data; }),
  ]);
  return {
    customers: cust.map((c) => ({ kind: "customer", id: c.id, name: c.full_name, num: c.the_user_id, account_id: c.account_id })),
    agents: ag.map((a) => ({ kind: "agent", id: a.id, name: a.agent_name, num: a.the_number, account_id: a.account_id })),
    vouchers: v.filter((x): x is typeof x & { customer_id: number } => x.customer_id != null),
    checks: ch.filter((x): x is typeof x & { customer_id: number } => x.customer_id != null),
    outgoing: o.filter((x): x is typeof x & { agent_id: number } => x.agent_id != null),
    incoming: i.filter((x): x is typeof x & { agent_id: number } => x.agent_id != null),
    settlements: s,
    entries: e.map((d) => ({ account_id: d.account_id, side: d.side, amount: d.amount, currency_id: d.currency_id, the_date: d.entries.the_date })),
    transferMovements: movements,
  };
}
export const allAccountsQuery = queryOptions({ queryKey: ["all_accounts"], queryFn: loadAllAccounts });