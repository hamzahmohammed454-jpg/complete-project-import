import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";
import { Route as ExchangeRoute } from "@/routes/_authenticated/exchange";
import { Route as TransfersRoute } from "@/routes/_authenticated/transfers";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  // بطاقات الرئيسية السريعة تفتح الاتجاه/النوع المطلوب مباشرة.
  it("opens the transfer direction the home card asked for", () => {
    const check = TransfersRoute.options.validateSearch as ((s: Record<string, unknown>) => ({ dir?: string })) | undefined;

    expect(check?.({ dir: "incoming" })).toEqual({ dir: "incoming" });
    expect(check?.({ dir: "outgoing" })).toEqual({ dir: "outgoing" });
    expect(check?.({ dir: "whatever" })).toEqual({});
  });

  it("opens the exchange operation the home card asked for", () => {
    const check = ExchangeRoute.options.validateSearch as ((s: Record<string, unknown>) => ({ kind?: string })) | undefined;

    expect(check?.({ kind: "buy" })).toEqual({ kind: "buy" });
    expect(check?.({ kind: "sell" })).toEqual({ kind: "sell" });
    expect(check?.({})).toEqual({});
  });
});
