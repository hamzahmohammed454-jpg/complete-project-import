// Offline replacement of setup.functions.ts for the "أبو الياس" app (swapped in by the local build).
// The first password set on the phone belongs to the admin; an imported admin keeps its history.
import { usernameToEmail } from "@/lib/username";
import { localAdminExists, localCreateUser, localDb, localSetPassword } from "./runtime";
import { flushToDisk } from "./engine";

export const FIRST_ADMIN_USERNAME = "admin";
export const FIRST_ADMIN_NAME = "مدير النظام";

export async function getSetupStatus() {
  return { needsSetup: !(await localAdminExists()) };
}

export async function setupFirstAdmin({ data }: { data: { password: string } }) {
  if (data.password.length < 8 || data.password.length > 72) throw new Error("WEAK_PASSWORD");
  if (await localAdminExists()) throw new Error("ALREADY_SET_UP");
  const { pg } = await localDb();
  const email = usernameToEmail(FIRST_ADMIN_USERNAME);
  const existing = await pg.query<{ id: string }>("select id from auth.users where lower(email) = lower($1)", [email]);
  let id = existing.rows[0]?.id;
  if (id) await localSetPassword(id, data.password);
  else {
    id = await localCreateUser(email, data.password, { full_name: FIRST_ADMIN_NAME, username: FIRST_ADMIN_USERNAME });
    await pg.query("update public.profiles set username = $2, full_name = $3 where id = $1", [id, FIRST_ADMIN_USERNAME, FIRST_ADMIN_NAME]);
  }
  await pg.query("insert into public.user_roles(user_id, role) select $1, 'admin' where not exists (select 1 from public.user_roles where user_id = $1 and role = 'admin')", [id]);
  await flushToDisk(pg);
  return { username: FIRST_ADMIN_USERNAME };
}
