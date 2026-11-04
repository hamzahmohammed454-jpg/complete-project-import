// Offline replacement of staff.functions.ts for the "أبو الياس" app (swapped in by the local build).
// Same checks as the cloud: only an unlocked admin may create or reset accounts.
import { usernameToEmail } from "@/lib/username";
import { asCurrentUser, localCreateUser, localSetPassword } from "./runtime";

type StaffInput = {
  username: string; password: string; full_name: string; phone: string; branch_name: string;
  role: "admin" | "manager" | "teller" | "accountant";
  enforce_box?: boolean; enforce_currency?: boolean; allow_past_date?: boolean; allow_future_date?: boolean; allow_buy?: boolean; allow_sell?: boolean;
  branch_id?: number | null; box_id?: number | null; currency_id?: number | null;
};

async function requireAdmin(tx: import("@electric-sql/pglite").Transaction, userId: string) {
  const r = await tx.query<{ ok: boolean }>("select public.is_admin($1::uuid) and public.staff_session_unlocked() and public.staff_mfa_satisfied() as ok", [userId]);
  if (!r.rows[0]?.ok) throw new Error("FORBIDDEN");
}

export async function createStaff({ data }: { data: StaffInput }) {
  const username = data.username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(username) || data.password.length < 8) throw new Error("FAILED");
  if (data.enforce_box && !data.box_id) throw new Error("ASSIGNED_BOX_REQUIRED");
  if (data.enforce_currency && !data.currency_id) throw new Error("ASSIGNED_CURRENCY_REQUIRED");
  await asCurrentUser((tx, uid) => requireAdmin(tx, uid));
  const id = await localCreateUser(usernameToEmail(username), data.password, { full_name: data.full_name, phone: data.phone, username });
  await asCurrentUser(async (tx) => {
    await tx.query("update public.profiles set username = $2, full_name = $3, phone = $4, branch_name = $5 where id = $1", [id, username, data.full_name, data.phone, data.branch_name]);
    await tx.query("insert into public.user_roles(user_id, role) values ($1, $2::public.app_role)", [id, data.role]);
    await tx.query(
      "insert into public.staff_work_defaults(user_id, enforce_box, enforce_currency, allow_past_date, allow_future_date, allow_buy, allow_sell, branch_id, box_id, currency_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [id, !!data.enforce_box, !!data.enforce_currency, data.allow_past_date ?? true, data.allow_future_date ?? true, data.allow_buy ?? true, data.allow_sell ?? true, data.branch_id ?? null, data.box_id ?? null, data.currency_id ?? null],
    );
  });
  return { id };
}

export async function updateStaffProfile({ data }: { data: { user_id: string; full_name: string; phone: string; branch_name: string; password?: string } }) {
  await asCurrentUser(async (tx, uid) => {
    await requireAdmin(tx, uid);
    await tx.query("update public.profiles set full_name = $2, phone = $3, branch_name = $4 where id = $1", [data.user_id, data.full_name, data.phone, data.branch_name]);
    if (data.password) await tx.query("insert into public.activity_log(user_id, action, target) values ($1, 'إعادة تعيين كلمة مرور موظف', $2)", [uid, data.user_id]);
  });
  if (data.password) await localSetPassword(data.user_id, data.password);
  return { id: data.user_id };
}
