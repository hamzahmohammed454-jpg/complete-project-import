import { describe, expect, it } from "vitest";
import { hasUnresolvedTemp, remapIds, syncErrorMessage, type OutboxItem } from "@/lib/offline/outbox-core";
import { isRefusedHost } from "@/lib/pwa-register";

const item = (url: string, body: string | null = null): OutboxItem => ({
  id: "1", createdAt: 0, method: "PATCH", url, headers: {}, body, tempId: null, label: "", status: "pending",
});

describe("offline outbox", () => {
  it("replaces a temporary id with the real numeric id", () => {
    expect(remapIds('{"transfer_id":"pending-abc"}', { "pending-abc": 42 })).toBe('{"transfer_id":42}');
    expect(remapIds("x?id=eq.pending-abc", { "pending-abc": 42 })).toBe("x?id=eq.42");
  });
  it("blocks an operation whose parent was never synced", () => {
    expect(hasUnresolvedTemp(item("https://a/rest/v1/transfers?id=eq.pending-zz"), {})).toBe(true);
    expect(hasUnresolvedTemp(item("https://a/rest/v1/transfers?id=eq.pending-zz"), { "pending-zz": 1 })).toBe(false);
  });
  it("explains a permission refusal in Arabic", () => {
    expect(syncErrorMessage(403, "")).toBe("لا تملك صلاحية تنفيذ هذه العملية");
  });
});

describe("service worker host guard", () => {
  it("refuses previews and allows published sites", () => {
    expect(isRefusedHost("id-preview-1--abc.lovable.app")).toBe(true);
    expect(isRefusedHost("preview--abc.lovable.app")).toBe(true);
    expect(isRefusedHost("myapp.lovable.app")).toBe(false);
    expect(isRefusedHost("myapp.lovable.app", "?sw=off")).toBe(true);
  });
});

import { canReplayAs, isAlreadySaved, withClientRef, canQueueRequest, dependentItemIds } from "@/lib/offline/outbox-core";
it("never replays another user's operation or an unowned legacy operation", () => {
  const owned = { ...item("https://a/rest/v1/customers"), ownerId: "user-a" };
  expect(canReplayAs(owned, "user-a")).toBe(true);
  expect(canReplayAs(owned, "user-b")).toBe(false);
  expect(canReplayAs(item("https://a/rest/v1/customers"), "user-a")).toBe(false);
});
describe("offline duplicate protection", () => {
  it("tags offline buy operations and recognises an already-saved resend", () => {
    expect(withClientRef("https://a/rest/v1/buy_currencies", '{"amount":5}', "r1")).toBe('{"amount":5,"client_ref":"r1"}');
    expect(isAlreadySaved(409, '{"code":"23505","message":"buy_currencies_client_ref_key"}')).toBe(true);
    expect(isAlreadySaved(409, '{"code":"23505","message":"customers_name_key"}')).toBe(false);
  });
});

it("allows audited creates but excludes multi-row, check-funded, upsert and sensitive writes", () => {
  const url = "https://a/rest/v1/";
  expect(canQueueRequest("POST", url + "outgoing_transfers", '{"payment_method":"cash"}')).toBe(true);
  expect(canQueueRequest("POST", url + "outgoing_transfers", '{"payment_method":"check","check_id":1}')).toBe(false);
  expect(canQueueRequest("POST", url + "customers", '[{"full_name":"A"},{"full_name":"B"}]')).toBe(false);
  expect(canQueueRequest("POST", url + "customers?on_conflict=id", '{}')).toBe(false);
  expect(canQueueRequest("POST", url + "box_movements", '{}')).toBe(false);
  expect(canQueueRequest("POST", url + "rpc/post_funds_inventory", '{}')).toBe(false);
  expect(canQueueRequest("DELETE", url + "customers", null)).toBe(false);
});
it("finds every dependent intent before discarding its parent", () => {
  const parent = { ...item("https://a/rest/v1/customers"), id: "parent", tempId: "pending-parent" };
  const child = { ...item("https://a/rest/v1/outgoing_transfers", '{"customer_id":"pending-parent"}'), id: "child", tempId: "pending-child" };
  const grandchild = { ...item("https://a/rest/v1/transfers?id=eq.pending-child"), id: "grandchild" };
  expect([...dependentItemIds([parent, child, grandchild], "parent")]).toEqual(["child", "grandchild"]);
});
