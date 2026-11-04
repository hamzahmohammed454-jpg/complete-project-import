import type { QueryClient } from "@tanstack/react-query";

let active: QueryClient | null = null;
export function setActiveQueryClient(qc: QueryClient) {
  active = qc;
}
export function getActiveQueryClient() {
  return active;
}
