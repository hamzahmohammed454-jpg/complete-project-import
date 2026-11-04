// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ABU_EXPORT_TABLES } from "@/lib/abu-export";
import { SKIP_TABLES } from "@/lib/local-db/import";

describe("export to the أبو الياس phone app", () => {
  it("never copies sessions, licensing or activation codes", () => {
    for (const t of ["staff_session_locks", "installation_license", "activation_codes", "platform_owners", "admin_setup_claim"]) {
      expect(ABU_EXPORT_TABLES).not.toContain(t);
    }
  });

  it("only exports tables the phone import accepts", () => {
    for (const t of ABU_EXPORT_TABLES) expect(SKIP_TABLES.has(t)).toBe(false);
  });

  it("includes the money ledgers so balances arrive intact", () => {
    for (const t of ["box_movements", "entries", "entries_details", "customer_transfer_movements", "outgoing_transfers", "incoming_transfers"]) {
      expect(ABU_EXPORT_TABLES).toContain(t);
    }
  });
});
