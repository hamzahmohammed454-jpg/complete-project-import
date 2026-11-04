import { useScreenPermissions } from "@/hooks/use-screen-permissions";
import { Notice } from "@/components/ui-kit";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { SectionIntro } from "@/components/section";
import { VoucherCard } from "@/components/voucher";
import { supabase } from "@/integrations/supabase/client";
import {
  VOUCHER_KINDS,
  buildCashVoucher,
  buildExchangeVoucher,
  buildJournalVoucher,
  buildTransferVoucher,
  type CashVoucherRow,
  type ExchangeRow,
  type JournalVoucherRow,
  type TransferRow,
  type VoucherKind,
  type VoucherModel,
  type AccountNotice,
  journalNotices,
  transferNotice,
} from "@/lib/voucher";
import { AccountNoticeCard } from "@/components/account-notice";

export const Route = createFileRoute("/_authenticated/voucher/$kind/$id")({
  head: () => ({
    meta: [
      { title: "سند العملية — ابو طه للصرافة" },
      { property: "og:title", content: "سند العملية — ابو طه للصرافة" },
      { property: "og:description", content: "سند الحوالة وطريقة الدفع وبيانات المرسل والمستلم والعمولة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        name: "description",
        content: "سند مطبوع أو مشارَك عبر واتساب لحوالة صادرة أو واردة أو عملية بيع وشراء أو قيد بسيط.",
      },
    ],
  }),
  component: VoucherScreen,
});

const TRANSFER_FIELDS =
  "id, document_number, transfer_number, amount, the_date, sender_name, sender_phone, receiver_name, receiver_phone, state, delivered, canceled, branch_commission, payment_method, reference_number, customers(full_name, phone_number, account:accounts!account_id(account_number)), notes, created_by, currencies!currency_id(currency_name), commission_currency:currencies!commission_currency_id(currency_name), agents!agent_id(agent_name)";

const EXCHANGE_FIELDS =
  "id, document_number, the_number, account_id, amount, price, exchange_amount, commission, the_date, cash_customer_name, customer_phone, notes, created_by, currencies!currency_id(currency_name), exchange_currency:currencies!exchange_currency_id(currency_name)";

function VoucherScreen() {
  const { kind: rawKind, id } = Route.useParams();
  const kind = rawKind as VoucherKind;
  const permissions = useScreenPermissions(kind === "outgoing" || kind === "incoming" ? "/transfers" : kind === "buy" || kind === "sell" ? "/exchange" : kind === "journal" ? "/journal" : "/vouchers");
  const valid = (VOUCHER_KINDS as readonly string[]).includes(kind) && /^\d+$/.test(id);

  const query = useQuery({
    queryKey: ["voucher", kind, id],
    enabled: valid && permissions.can("print"),
    queryFn: async (): Promise<{ model: VoucherModel; notices?: AccountNotice[] } | null> => {
      const rowId = Number(id);

      if (kind === "outgoing" || kind === "incoming") {
        const table = kind === "outgoing" ? "outgoing_transfers" : "incoming_transfers";
        const { data, error } = await supabase
          .from(table)
          .select(TRANSFER_FIELDS)
          .eq("id", rowId)
          .maybeSingle();
        if (error) throw error;
        if (!data) return null;
        const staff = await staffName(data.created_by as string | null);
        const transferRow: TransferRow = {
          document_number: data.document_number,
          payment_method: data.payment_method,
          customer_name: data.customers?.full_name ?? null,
          reference_number: data.reference_number,
          id: data.id,
          transfer_number: data.transfer_number,
          amount: data.amount,
          the_date: data.the_date,
          sender_name: data.sender_name,
          sender_phone: data.sender_phone,
          receiver_name: data.receiver_name,
          receiver_phone: data.receiver_phone,
          state: data.state,
          delivered: data.delivered,
          canceled: data.canceled,
          branch_commission: data.branch_commission,
          notes: data.notes,
          currency_name: (data.currencies as { currency_name: string } | null)?.currency_name ?? null,
          commission_currency_name:
            (data.commission_currency as { currency_name: string } | null)?.currency_name ?? null,
          agent_name: (data.agents as { agent_name: string } | null)?.agent_name ?? null,
        };
        const model = buildTransferVoucher(kind, transferRow, staff);
        const cust = data.customers as { full_name: string; phone_number: string | null; account: { account_number: number } | null } | null;
        if (data.payment_method === "account" && cust) {
          return { model, notices: [transferNotice(kind, transferRow, { name: cust.full_name, number: String(cust.account?.account_number ?? "—"), phone: cust.phone_number }, staff)] };
        }
        return { model };
      }

      if (kind === "receipt" || kind === "payment" || kind === "deposit") {
        const { data, error } = await supabase
          .from("cash_vouchers")
          .select("id, batch_id, document_number, the_number, voucher_type, amount, the_date, cash_name, notes, created_by, customers(full_name), currencies!currency_id(currency_name), boxes(box_name)")
          .eq("id", rowId)
          .maybeSingle();
        if (error) throw error;
        if (!data) return null;
        if (data.voucher_type !== ({ receipt: "قبض", payment: "صرف", deposit: "إيداع" }[kind])) return null;
        let amounts: CashVoucherRow["amounts"];
        if (data.batch_id) {
          const { data: lines, error: linesError } = await supabase.from("cash_vouchers").select("amount, currencies!currency_id(currency_name)").eq("batch_id", data.batch_id).order("batch_position");
          if (linesError) throw linesError;
          amounts = lines.map((line) => ({ amount: line.amount, currency_name: line.currencies?.currency_name ?? null }));
        }
        const staff = await staffName(data.created_by as string | null);
        const cashRow: CashVoucherRow = {
          ...(amounts ? { amounts } : {}),
          document_number: data.document_number,
          id: data.id,
          the_number: data.the_number,
          voucher_type: data.voucher_type,
          amount: data.amount,
          the_date: data.the_date,
          cash_name: data.cash_name,
          notes: data.notes,
          customer_name: (data.customers as { full_name: string } | null)?.full_name ?? null,
          currency_name: (data.currencies as { currency_name: string } | null)?.currency_name ?? null,
          box_name: (data.boxes as { box_name: string } | null)?.box_name ?? null,
        };
        return { model: buildCashVoucher(kind, cashRow, staff) };
      }

      if (kind === "journal") {
        const { data, error } = await supabase
          .from("journal_vouchers")
          .select("id, document_number, the_number, the_date, amount, notes, created_by, debit_account:accounts!debit_account_id(id, account_number, account_name), credit_account:accounts!credit_account_id(id, account_number, account_name), currencies!currency_id(currency_name)")
          .eq("id", rowId)
          .maybeSingle();
        if (error) throw error;
        if (!data) return null;
        const staff = await staffName(data.created_by as string | null);
        const journalRow: JournalVoucherRow = {
          document_number: data.document_number,
          id: data.id,
          the_number: data.the_number,
          the_date: data.the_date,
          amount: data.amount,
          notes: data.notes,
          debit_account: (data.debit_account as { account_number: number; account_name: string } | null)
            ? `${data.debit_account?.account_number} — ${data.debit_account?.account_name}`
            : null,
          credit_account: (data.credit_account as { account_number: number; account_name: string } | null)
            ? `${data.credit_account?.account_number} — ${data.credit_account?.account_name}`
            : null,
          currency_name: (data.currencies as { currency_name: string } | null)?.currency_name ?? null,
        };
        const model = buildJournalVoucher(journalRow, staff);
        const da = data.debit_account as { id: number; account_number: number; account_name: string } | null;
        const ca = data.credit_account as { id: number; account_number: number; account_name: string } | null;
        if (!da || !ca) return { model };
        const { data: phones } = await supabase.from("customers").select("account_id, phone_number").in("account_id", [da.id, ca.id]);
        const phoneOf = (id: number) => phones?.find((p) => p.account_id === id)?.phone_number ?? null;
        const notices = journalNotices(
          { number: model.number, date: model.date, amount: Number(data.amount), currency: model.currency ?? "", notes: data.notes },
          { name: da.account_name, number: String(da.account_number), phone: phoneOf(da.id) },
          { name: ca.account_name, number: String(ca.account_number), phone: phoneOf(ca.id) },
          staff,
        );
        return { model, notices };
      }


      const table = kind === "buy" ? "buy_currencies" : "sell_currencies";
      const { data, error } = await supabase
        .from(table)
        .select(EXCHANGE_FIELDS)
        .eq("id", rowId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const staff = await staffName(data.created_by as string | null);
      const exchangeRow: ExchangeRow = {
        document_number: data.document_number,
        id: data.id,
        the_number: data.the_number,
        amount: data.amount,
        price: data.price,
        exchange_amount: data.exchange_amount,
        commission: data.commission,
        the_date: data.the_date,
        account_id: data.account_id,
        cash_customer_name: data.cash_customer_name,
        customer_phone: data.customer_phone,
        notes: data.notes,
        currency_name: (data.currencies as { currency_name: string } | null)?.currency_name ?? null,
        exchange_currency_name:
          (data.exchange_currency as { currency_name: string } | null)?.currency_name ?? null,
      };
      return { model: buildExchangeVoucher(kind, exchangeRow, staff) };
    },
  });

  const model = query.data?.model ?? null;
  const notices = query.data?.notices;

  if (!permissions.isLoading && !permissions.can("print")) return <Notice tone="info">طباعة هذا المستند غير مسموحة لمجموعتك.</Notice>;
  return (
    <>
      <div className="print:hidden">
        <Link
          to={kind === "outgoing" || kind === "incoming" ? "/transfers" : kind === "buy" || kind === "sell" ? "/exchange" : kind === "journal" ? "/journal" : "/vouchers"}
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
        >
          <ArrowRight className="size-3.5" />
          رجوع
        </Link>
        <SectionIntro
          title="سند العملية"
          subtitle="اطبع السند أو شاركه عبر واتساب. رقم السند هو نفسه رقم العملية في النظام."
        />
      </div>
      {!valid ? (
        <p className="rounded-2xl border border-dashed border-border bg-paper p-4 text-sm text-muted-foreground">
          هذا السند غير موجود.
        </p>
      ) : query.isLoading ? (
        <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
      ) : query.isError ? (
        <p className="rounded-2xl border border-dashed border-border bg-paper p-4 text-sm text-destructive">
          تعذّر تحميل السند.
        </p>
      ) : !model ? (
        <p className="rounded-2xl border border-dashed border-border bg-paper p-4 text-sm text-muted-foreground">
          هذا السند غير موجود.
        </p>
      ) : (
        notices?.length ? (
          <div className="space-y-6">{notices.map((n) => <div key={n.side} className="break-after-page"><AccountNoticeCard notice={n} /></div>)}</div>
        ) : (
          <VoucherCard model={model} />
        )
      )}
    </>
  );
}

async function staffName(userId: string | null): Promise<string> {
  if (!userId) return "";
  const { data } = await supabase
    .from("profiles")
    .select("username, full_name")
    .eq("id", userId)
    .maybeSingle();
  return data?.username || data?.full_name || "";
}
