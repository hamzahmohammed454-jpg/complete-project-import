/**
 * محرك بوت واتساب على الخادم: الإرسال عبر بوابة الربط، تحليل الرسائل والصور بالذكاء الاصطناعي،
 * كشف الحوالات المكررة، وأوامر المالك. يُستورد فقط من داخل معالجات الخادم.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateChatCompletion, GatewayError } from "@lovable.dev/ai-gateway";

import type { Database } from "@/integrations/supabase/types";
import { botGate, coerceAnalysis, customerKindAllowed, itemLine, KIND_LABELS, needsOwnerApproval, normalizePhone, OWNER_HELP, parseOwnerCommand, routeToOwners, type Analysis } from "./logic";

type Admin = SupabaseClient<Database>;
const GATEWAY_URL = "https://connector-gateway.lovable.dev/whatsapp";
const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

function keys() {
  const lovable = process.env["LOVABLE_API_KEY"];
  const wa = process.env["WHATSAPP_API_KEY"];
  if (!lovable) throw new Error("LOVABLE_API_KEY is not configured");
  if (!wa) throw new Error("WHATSAPP_API_KEY is not configured");
  return { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": wa };
}

/**
 * يرسل رسالة نصية مرة واحدة لكل مفتاح رد. المحاولة الفاشلة تُعاد، والنتيجة الغامضة
 * (انقطاع بعد الإرسال) تبقى «غير معروفة» ولا تُرسل مجددًا تلقائيًا.
 */
export async function sendOnce(admin: Admin, opts: { to: string; body: string; replyKey: string; contactId?: number | null }) {
  const auth = keys(); // تحقق من الإعداد قبل حجز الرسالة حتى لا تبقى «قيد الإرسال»
  const { data: existing, error: readErr } = await admin.from("wa_messages").select("id, send_state").eq("reply_key", opts.replyKey).maybeSingle();
  if (readErr) throw readErr;
  if (existing && existing.send_state !== "failed") return; // تم أو قيد التسوية
  let rowId = existing?.id;
  if (!rowId) {
    const { data: ins, error } = await admin
      .from("wa_messages")
      .insert({ direction: "out", phone: opts.to, contact_id: opts.contactId ?? null, body: opts.body, reply_key: opts.replyKey, send_state: "sending" })
      .select("id")
      .single();
    if (error) throw error;
    rowId = ins.id;
  } else {
    const { error } = await admin.from("wa_messages").update({ send_state: "sending", send_error: null }).eq("id", rowId);
    if (error) throw error;
  }

  let res: Response;
  try {
    res = await fetch(`${GATEWAY_URL}/messages`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: opts.to, type: "text", text: { body: opts.body.slice(0, 4000) } }),
    });
  } catch (e) {
    await admin.from("wa_messages").update({ send_state: "unknown", send_error: String(e).slice(0, 500) }).eq("id", rowId);
    return;
  }
  const text = await res.text();
  if (!res.ok) {
    await admin.from("wa_messages").update({ send_state: "failed", send_error: `[${res.status}] ${text.slice(0, 800)}` }).eq("id", rowId);
    throw new Error(`WhatsApp send failed [${res.status}]: ${text}`);
  }
  let waId: string | null = null;
  try { waId = (JSON.parse(text) as { messages?: { id?: string }[] }).messages?.[0]?.id ?? null; } catch {}
  const { error } = await admin.from("wa_messages").update({ send_state: "accepted", wa_message_id: waId }).eq("id", rowId);
  if (error) throw error;
}

/** ينزّل وسائط واتساب بحد أقصى للحجم ويعيدها كرابط بيانات للصور. */
export async function downloadMedia(mediaId: string): Promise<{ dataUrl: string; mime: string } | null> {
  const meta = await fetch(`${GATEWAY_URL}/media/${encodeURIComponent(mediaId)}`, { headers: keys() });
  if (!meta.ok) throw new Error(`Media lookup failed [${meta.status}]: ${await meta.text()}`);
  const info = (await meta.json()) as { url?: string; mime_type?: string; file_size?: number };
  if (!info.url) throw new Error("Media URL missing");
  if ((info.file_size ?? 0) > MAX_MEDIA_BYTES) return null;
  const file = await fetch(`${GATEWAY_URL}/media_download`, { headers: { ...keys(), "X-WhatsApp-Media-URL": info.url } });
  if (!file.ok || !file.body) throw new Error(`Media download failed [${file.status}]`);
  const reader = file.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_MEDIA_BYTES) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { all.set(c, off); off += c.byteLength; }
  let bin = "";
  for (let i = 0; i < all.length; i += 0x8000) bin += String.fromCharCode(...all.subarray(i, i + 0x8000));
  const mime = file.headers.get("content-type") ?? info.mime_type ?? "image/jpeg";
  return { dataUrl: `data:${mime};base64,${btoa(bin)}`, mime };
}

const AI_PROMPT = `أنت محلل رسائل لمكتب صرافة وحوالات في اليمن. تصلك رسالة واتساب (نص و/أو صورة إشعار أو سند).
أعد JSON فقط بالمفاتيح:
kind: واحد من transfer_notice (إشعار حوالة من صراف/وكيل), deposit (طلب إيداع), withdrawal (طلب سحب), transfer (طلب إرسال حوالة), balance_inquiry (استفسار عن رصيد), other.
summary: جملة عربية قصيرة تصف الطلب.
transfer_number: رقم الحوالة أو المرجع إن وُجد كنص، وإلا null.
amount: المبلغ كرقم، وإلا null.
currency: العملة (ريال يمني، ريال سعودي، دولار...) وإلا null.
sender: اسم المرسل إن وُجد، receiver: اسم المستلم إن وُجد.
لا تخترع أي رقم غير موجود في الرسالة.`;

export async function analyze(text: string, image: string | null): Promise<Analysis> {
  const content: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [
    { type: "text", text: text || "(بلا نص)" },
  ];
  if (image) content.push({ type: "image_url", image_url: { url: image } });
  const res = await generateChatCompletion({
    model: "google/gemini-3-flash-preview",
    messages: [
      { role: "system", content: AI_PROMPT },
      { role: "user", content },
    ],
    response_format: { type: "json_object" },
  });
  const raw = res.choices?.[0]?.message?.content;
  const str = typeof raw === "string" ? raw : "";
  try {
    return coerceAnalysis(JSON.parse(str.replace(/^```(?:json)?|```$/g, "").trim()));
  } catch {
    return coerceAnalysis({ kind: "other", summary: text.slice(0, 120) });
  }
}

export async function findDuplicate(admin: Admin, num: string, selfMessageId: string): Promise<string | null> {
  const { data: prev, error } = await admin
    .from("wa_items")
    .select("id")
    .eq("transfer_number", num)
    .neq("inbound_message_id", selfMessageId)
    .neq("status", "rejected")
    .limit(1);
  if (error) throw error;
  const first = prev?.[0];
  if (first) return `مكرر لطلب واتساب #${first.id}`;
  const asInt = /^\d{1,15}$/.test(num) ? Number(num) : null;
  for (const table of ["incoming_transfers", "outgoing_transfers"] as const) {
    let q = admin.from(table).select("id").limit(1);
    q = asInt !== null ? q.or(`reference_number.eq.${num},transfer_number.eq.${asInt}`) : q.eq("reference_number", num);
    const { data, error: e } = await q;
    if (e) throw e;
    if (data?.length) return table === "incoming_transfers" ? "مسجلة مسبقًا في الحوالات الواردة" : "مسجلة مسبقًا في الحوالات الصادرة";
  }
  return null;
}

type Settings = Database["public"]["Tables"]["wa_bot_settings"]["Row"];

async function loadSettings(admin: Admin): Promise<Settings> {
  const { data, error } = await admin.from("wa_bot_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("wa_bot_settings row missing");
  return data;
}

async function owners(admin: Admin) {
  const { data, error } = await admin.from("wa_contacts").select("id, phone, notify_kinds").eq("role", "owner").eq("active", true);
  if (error) throw error;
  return data ?? [];
}

type InMsg = { id: string; from: string; timestamp?: string; type: string; text?: { body?: string }; image?: { id: string; caption?: string }; document?: { id: string; caption?: string; mime_type?: string } };

async function handleOwner(admin: Admin, msg: InMsg, contact: { id: number; phone: string }, text: string) {
  const cmd = parseOwnerCommand(text);
  const reply = (body: string) => sendOnce(admin, { to: contact.phone, body, replyKey: `owner:${msg.id}`, contactId: contact.id });
  if (cmd.kind === "help" || cmd.kind === "unknown") return reply(cmd.kind === "unknown" ? `لم أفهم الأمر.\n${OWNER_HELP}` : OWNER_HELP);
  if (cmd.kind === "pending" || cmd.kind === "today") {
    let q = admin.from("wa_items").select("id, kind, summary, amount, currency, status, wa_contacts(display_name)").order("id", { ascending: false }).limit(15);
    q = cmd.kind === "pending" ? q.eq("status", "pending") : q.gte("created_at", new Date(Date.now() - 24 * 3600e3).toISOString());
    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) return reply(cmd.kind === "pending" ? "لا توجد طلبات معلقة." : "لا توجد طلبات خلال آخر ٢٤ ساعة.");
    const lines = data.map((i) => itemLine({ ...i, name: i.wa_contacts?.display_name ?? null }) + (cmd.kind === "today" ? ` [${i.status}]` : ""));
    return reply(`${cmd.kind === "pending" ? "الطلبات المعلقة" : "طلبات اليوم"}:\n${lines.join("\n")}`);
  }
  const { data: item, error } = await admin.from("wa_items").select("*, wa_contacts(id, phone, display_name)").eq("id", cmd.id).maybeSingle();
  if (error) throw error;
  if (!item) return reply(`لا يوجد طلب برقم #${cmd.id}`);
  if (cmd.kind === "details") {
    const d = item.data as { sender?: string | null; receiver?: string | null };
    return reply([itemLine({ ...item, name: item.wa_contacts?.display_name ?? null }), `الحالة: ${item.status}`, item.transfer_number ? `رقم الحوالة: ${item.transfer_number}` : "", d.sender ? `المرسل: ${d.sender}` : "", d.receiver ? `المستلم: ${d.receiver}` : "", item.duplicate_note ?? ""].filter(Boolean).join("\n"));
  }
  if (item.status !== "pending") return reply(`الطلب #${item.id} سبق البت فيه (${item.status}).`);
  const approve = cmd.kind === "approve";
  const { error: upErr } = await admin
    .from("wa_items")
    .update({ status: approve ? "approved" : "rejected", commission: approve ? cmd.commission : null, decided_via: `whatsapp:${contact.phone}`, decided_at: new Date().toISOString(), duplicate_note: !approve && cmd.reason ? `سبب الرفض: ${cmd.reason}` : item.duplicate_note })
    .eq("id", item.id)
    .eq("status", "pending");
  if (upErr) throw upErr;
  await reply(`${approve ? "✅ تم اعتماد" : "❌ تم رفض"} الطلب #${item.id}${approve && cmd.commission ? ` بعمولة ${cmd.commission}` : ""}.`);
  if (item.wa_contacts?.phone) {
    await sendOnce(admin, {
      to: item.wa_contacts.phone,
      contactId: item.wa_contacts.id,
      replyKey: `decision:${item.id}`,
      body: approve ? `تمت الموافقة على طلبكم رقم ${item.id} (${KIND_LABELS[item.kind] ?? ""}). ابو طه للصرافة.` : `نعتذر، تم رفض طلبكم رقم ${item.id}${cmd.kind === "reject" && cmd.reason ? `: ${cmd.reason}` : ""}. ابو طه للصرافة.`,
    });
  }
}

async function handleParty(admin: Admin, settings: Settings, msg: InMsg, contact: { id: number; phone: string; role: string; display_name: string }, text: string, mediaId: string | null) {
  const { data: existing, error: exErr } = await admin.from("wa_items").select("id, kind, summary, amount, currency, status").eq("inbound_message_id", msg.id).maybeSingle();
  if (exErr) throw exErr;
  let item = existing;
  if (!item) {
    const image = mediaId && settings.read_images ? await downloadMedia(mediaId) : null;
    if (!text && !image) return; // صورة بلا نص وقراءة الصور موقوفة
    const a = await analyze(text, image?.dataUrl ?? null);
    const kindOff = !customerKindAllowed(settings, contact.role, a.kind);
    const dup = a.transfer_number ? await findDuplicate(admin, a.transfer_number, msg.id) : null;
    const { data: ins, error } = await admin
      .from("wa_items")
      .upsert(
        {
          inbound_message_id: msg.id,
          contact_id: contact.id,
          source_role: contact.role,
          kind: a.kind,
          summary: a.summary,
          data: { sender: a.sender, receiver: a.receiver, text: text.slice(0, 1000), media_id: mediaId },
          transfer_number: a.transfer_number,
          amount: a.amount,
          currency: a.currency,
          status: dup ? "duplicate" : a.kind === "other" || kindOff ? "rejected" : "pending",
          duplicate_note: dup ?? (a.kind === "other" ? "ليست عملية مالية" : kindOff ? "هذا النوع من الطلبات غير مفعّل عبر واتساب" : null),
        },
        { onConflict: "inbound_message_id" },
      )
      .select("id, kind, summary, amount, currency, status")
      .single();
    if (error) throw error;
    item = ins;
  }
  const isDup = item.status === "duplicate";
  const ack = isDup
    ? `هذه الحوالة مسجلة مسبقًا ولن تُضاف مرة أخرى.`
    : item.kind === "other"
      ? `وصلت رسالتكم، وسيتواصل معكم الموظف عند الحاجة.`
      : item.status === "rejected"
        ? `هذا النوع من الطلبات غير متاح عبر واتساب حاليًا، يرجى التواصل مع المكتب.`
        : `تم استلام ${KIND_LABELS[item.kind] ?? "طلبكم"} برقم ${item.id}، وهو قيد المراجعة.`;
  if (settings.auto_ack || item.status === "rejected") await sendOnce(admin, { to: contact.phone, body: ack, replyKey: `ack:${msg.id}`, contactId: contact.id });
  if (needsOwnerApproval(item.kind, isDup) && item.status === "pending" && settings.owners_enabled) {
    for (const o of routeToOwners(await owners(admin), item.kind)) {
      await sendOnce(admin, {
        to: o.phone,
        contactId: o.id,
        replyKey: `notify:${msg.id}:${o.phone}`,
        body: `طلب جديد من ${contact.display_name || contact.phone}:\n${itemLine(item)}\nللاعتماد: موافقة ${item.id}\nللرفض: رفض ${item.id}`,
      });
    }
  }
}

async function handleMessage(admin: Admin, msg: InMsg) {
  const phone = normalizePhone(msg.from);
  const text = msg.text?.body ?? msg.image?.caption ?? msg.document?.caption ?? "";
  const mediaId = msg.image?.id ?? (msg.document?.mime_type?.startsWith("image/") ? msg.document.id : null);
  const { data: contact, error } = await admin.from("wa_contacts").select("id, phone, role, display_name").eq("phone", phone).eq("active", true).maybeSingle();
  if (error) throw error;
  const { error: insErr } = await admin.from("wa_messages").upsert(
    { direction: "in", wa_message_id: msg.id, phone, contact_id: contact?.id ?? null, msg_type: msg.type, body: text.slice(0, 4000), media_id: msg.image?.id ?? msg.document?.id ?? null, provider_ts: msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : null },
    { onConflict: "wa_message_id", ignoreDuplicates: true },
  );
  if (insErr) throw insErr;
  const settings = await loadSettings(admin);
  if (!contact) {
    if (!settings.reply_unregistered || !settings.enabled) return;
    return sendOnce(admin, { to: phone, body: settings.unregistered_text, replyKey: `unreg:${msg.id}` });
  }
  if (botGate(settings, contact.role) === "paused") {
    return sendOnce(admin, { to: contact.phone, body: settings.paused_text, replyKey: `paused:${msg.id}`, contactId: contact.id });
  }
  if (contact.role === "owner") return handleOwner(admin, msg, contact, text);
  if (!text && !mediaId) return; // ملصق أو صوت: لا شيء نحلله
  return handleParty(admin, settings, msg, contact, text, mediaId);
}

type Status = { id: string; status: string; timestamp?: string; recipient_id?: string; errors?: unknown };

async function handleStatuses(admin: Admin, statuses: Status[]) {
  for (const s of statuses) {
    const ts = s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : null;
    const { data: prev, error } = await admin.from("wa_message_statuses").select("id, provider_ts").eq("wa_message_id", s.id).eq("status", s.status).maybeSingle();
    if (error) throw error;
    if (prev) {
      if (!prev.provider_ts && ts) {
        const { error: e } = await admin.from("wa_message_statuses").update({ provider_ts: ts }).eq("id", prev.id);
        if (e) throw e;
      }
      continue;
    }
    const { error: e } = await admin.from("wa_message_statuses").upsert(
      { wa_message_id: s.id, status: s.status, provider_ts: ts, errors: (s.errors as Database["public"]["Tables"]["wa_message_statuses"]["Insert"]["errors"]) ?? null, recipient: s.recipient_id ?? null },
      { onConflict: "wa_message_id,status", ignoreDuplicates: true },
    );
    if (e) throw e;
  }
}

/** يعالج حدثًا مخزنًا واحدًا. أي خطأ يبقيه معلقًا لإعادة المحاولة لاحقًا. */
export async function processEvent(admin: Admin, row: { id: number; event: string; payload: unknown; attempts: number }) {
  try {
    const value = (row.payload as { entry?: { changes?: { value?: Record<string, unknown> }[] }[] })?.entry?.[0]?.changes?.[0]?.value ?? {};
    if (row.event === "whatsapp.message") {
      for (const m of (value["messages"] as InMsg[] | undefined) ?? []) await handleMessage(admin, m);
    } else if (row.event === "whatsapp.status") {
      await handleStatuses(admin, (value["statuses"] as Status[] | undefined) ?? []);
    }
    const { error } = await admin.from("whatsapp_webhook_events").update({ processed_at: new Date().toISOString(), processing_error: null }).eq("id", row.id);
    if (error) throw error;
    return true;
  } catch (e) {
    const msg = e instanceof GatewayError ? `AI ${e.code}: ${e.message}` : e instanceof Error ? e.message : String(e);
    const delayMin = Math.min(2 ** row.attempts, 24 * 60);
    await admin
      .from("whatsapp_webhook_events")
      .update({ processing_error: msg.slice(0, 1000), attempts: row.attempts + 1, next_attempt_at: new Date(Date.now() + delayMin * 60e3).toISOString() })
      .eq("id", row.id);
    return false;
  }
}

/** يعيد محاولة عدد محدود من الأحداث المعلقة المستحقة، الأقدم موعدًا أولًا. */
export async function processDue(admin: Admin, limit = 3, skipId?: number) {
  let q = admin.from("whatsapp_webhook_events").select("id, event, payload, attempts").is("processed_at", null).lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(limit);
  if (skipId) q = q.neq("id", skipId);
  const { data } = await q;
  for (const r of data ?? []) await processEvent(admin, r);
}

/** يرسل إشعار القرار للعميل عندما يعتمد المدير الطلب من التطبيق. */
export async function notifyDecision(admin: Admin, itemId: number) {
  const { data: item, error } = await admin.from("wa_items").select("id, kind, status, commission, duplicate_note, wa_contacts(id, phone)").eq("id", itemId).maybeSingle();
  if (error) throw error;
  if (!item?.wa_contacts?.phone || (item.status !== "approved" && item.status !== "rejected")) return;
  await sendOnce(admin, {
    to: item.wa_contacts.phone,
    contactId: item.wa_contacts.id,
    replyKey: `decision:${item.id}`,
    body: item.status === "approved" ? `تمت الموافقة على طلبكم رقم ${item.id} (${KIND_LABELS[item.kind] ?? ""}). ابو طه للصرافة.` : `نعتذر، تم رفض طلبكم رقم ${item.id}. ابو طه للصرافة.`,
  });
}
