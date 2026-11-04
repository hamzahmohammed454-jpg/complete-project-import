import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SessionSecurity, QuickLock } from "@/components/session-security";

const state = vi.hoisted(() => ({ data: undefined as unknown, online: false, cancel: vi.fn() }));
vi.mock("@/hooks/use-offline-status", () => ({ useOfflineStatus: () => ({ online: state.online }) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: state.data, isLoading: false, isError: false, refetch: vi.fn() }),
  useQueryClient: () => ({ cancelQueries: state.cancel, clear: vi.fn(), invalidateQueries: vi.fn() }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(), auth: { signOut: vi.fn() } } }));
afterEach(() => { cleanup(); state.data = undefined; state.online = false; vi.clearAllMocks(); });

it("never exposes staff content on an unverified cold offline start", () => {
  render(<SessionSecurity><div>protected ledger</div></SessionSecurity>);
  expect(screen.queryByText("protected ledger")).toBeNull();
});

it("locally locks a verified offline session immediately without requiring a security RPC", () => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  state.data = { status: { has_pin: false, locked: false, failed_attempts: 0 }, needsMfa: false };
  render(<SessionSecurity><div>protected ledger</div><QuickLock /></SessionSecurity>);
  expect(screen.getByText("protected ledger")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "قفل الشاشة" }));
  expect(screen.queryByText("protected ledger")).toBeNull();
  expect(state.cancel).toHaveBeenCalled();
});

it("never exposes staff content when a verified session still requires MFA", () => {
  state.data = { status: { has_pin: true, locked: false, failed_attempts: 0 }, needsMfa: true };
  render(<SessionSecurity><div>protected ledger</div></SessionSecurity>);
  expect(screen.queryByText("protected ledger")).toBeNull();
});