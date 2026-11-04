<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Exchange system — working rules
- Subdirectories may have their own `AGENTS.md`; read it before changing files there.
- Staff news uses a dedicated admin-managed announcement store; staff visibility follows active start/end dates.
- Exchange rates retain append-only history independently from current pair prices, so rate edits never rewrite posted operations.
- Transfer evidence stays in a private bucket with transfer-scoped permissions and short-lived signed links.
- Session PIN and enrolled MFA checks apply both in restrictive table policies and privileged posting/staff-management entry points; recovery RPCs remain callable while locked.
- Financial reports aggregate each currency separately and exclude the internal incoming mirror from incoming volume; commissions are not treated as realized exchange profits.
- Excel export pages through authorized records for review only; the restorable backup is a JSON snapshot with per-table counts and SHA-256 hashes, verified client-side without writing data.
- Internal transfers use one unique incoming payout leg linked to the outgoing receipt through database triggers; payout synchronizes delivery, cancellation originates on outgoing, and the payout leg carries no agent or commission to avoid duplicate money and totals.
- Check-funded outgoing transfers reference one unique registered incoming check; their box stays null, and collection is posted only by the check trigger, preventing duplicate receipts. Linked collected checks cannot be reset or financially edited.
- Account-funded buy/sell operations post both currencies (and commission) to append-only customer_transfer_movements through a database trigger, never touch a box, and post reversals on delete; check-paid receipt/payment vouchers are registered as checks so only collection moves the box and statement.
- Account-funded transfers post append-only customer_transfer_movements through database triggers and are consumed once in customer statements; they never create cash vouchers or automatic journals, avoiding duplicate customer balances.
- Posted transfer money fields are immutable; delivery/cancellation cannot be undone through direct updates, and internal export records the assigned agent without creating another cash movement.
- Group and employee permissions use has_screen_permission; role, session and license checks intersect action grants. New modules require actual staff roles and decision triggers guard privileged RPC writes, so grants never elevate roles.
- Staff work defaults live in admin-writable `staff_work_defaults`, separate from editable profiles; assignments preselect box/currency; manager-controlled enforcement flags are validated by operational database triggers and never grant roles.

- Navigation groups and account subsections are defined only in `src/lib/nav-groups.ts`; the right desktop sidebar, mobile drawer and menu strips resolve from that registry, so each screen belongs to one group and permissions remain unchanged.

- Every staff-facing screen lives under `src/routes/_authenticated/` behind the header-only shell in `src/components/app-shell.tsx`, because the app is a phone-first RTL Arabic tool and the sign-in screen owns `/`.
- Staff privileges live in `public.user_roles` read via `public.has_role()`; `public.profiles` holds display fields only — a user-editable row must never grant access.
- Staff-only actions are blocked in RLS first, then hidden in the UI via `src/hooks/use-app-roles.ts` over the pure predicate in `src/lib/roles.ts`.
- Money amounts and reference numbers render with the `.ledger-figures` class so digits stay column-aligned, which is how an exchange ledger is read and audited.
- Playwright output goes to absolute paths under `/tmp/browser/` only; a relative `screenshots/` dir lands in the project and gets committed.
- Reference numbers (accounts, agents, boxes, customers, per-agent transfer sequences) and the sub-account each agent/box/customer gets in the chart are assigned by DB triggers, so numbering stays consistent no matter which screen inserts the row; screens send 0/null to request one.
- Staff usernames map to internal emails; DB writes and shell opens/clicks enter activity_log, preserving the audit trail.
- Cash effects of operations (buy/sell, outgoing transfer, incoming delivery, cancel, agent settlement) are posted to box_movements by DB triggers and a closed box-day (box_closings) rejects new movements, so box balances and the daily close can't drift from the operations whichever screen writes them.
- Edit/delete of agents, boxes, customers keeps the chart in step via DB triggers (rename syncs the sub-account, delete removes it, and FK/guard triggers refuse deleting anything with operations or sub-accounts), so a delete can never orphan or erase ledger history.
- Offline caches/outboxes are auth-user scoped; replay checks identity after awaits. Privileged RPCs require network and are never queued; DB rules assign final numbers/balances.
- Offline writes are explicit pending-aware single-row insert intents from audited forms; stable client_ref precedes the first send, queue/ID-map persistence is atomic, and PATCH/DELETE, checks, settlement and privileged RPCs remain online-only to prevent duplicate or stale financial effects. Cold offline startup never trusts a persisted unlocked security flag.
- The app-shell service worker is generated by vite-plugin-pwa and registered only from src/lib/pwa-register.ts, which refuses dev, iframes, Lovable preview hosts and ?sw=off, so previews never serve stale caches.
- Offline-supported inserts carry a client_ref UUID protected by a partial unique database index, so resending the same insert cannot create a duplicate row.
- Document numbers use atomic per-type counters and permanent reservations; legacy identifiers remain separate.
- Activation is admin-only; code issuance also requires platform-owner authority, never group grants.
- Weekly debt reports reuse paginated statement balances and measure inactivity, not invoice allocation; contact imports never post balances.
- Branding is presentation-only; use the approved logo and its emblem for UI/PWA/favicon, never alter financial records or permissions when changing identity.
- Check books enforce number ranges; saving inventory is non-posting, while explicit inventory RPCs atomically post per-currency balanced entries and box adjustments with immutable reversal history; active postings block edits/deletes and stale box snapshots block posting. Loop templates generate balanced entries only. Multi-currency vouchers use atomic RPC batches of legacy cash_vouchers, one row per currency and shared document number, so existing box/statement paths count each once; deletion is whole-batch.
- Configured operation commissions post balanced source-linked journal counterparts without another box/customer charge; settlement_mirror details remain in the general ledger but are omitted from customer statement paths that already include the movement. Exchange spread reports compare weighted actual pair rates and never claim realized P&L.
- The Android app (com.alsarafa.exchange) is a Capacitor wrapper around the published site al-sarafa.lovable.app, not a bundled copy; app data and updates come from the live site. The signed release keystore (alsarafa.keystore, alias alsarafa) is the only key allowed to sign updates and is delivered in Files; never rebuild APKs with a different key or the installed app cannot update.
