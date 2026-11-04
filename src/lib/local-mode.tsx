// Cloud build: the app talks to the shared online database. The offline
// "أبو الياس" build swaps this module for src/lib/local-db/local-mode.tsx.
import type { ReactNode } from "react";

export const IS_LOCAL_APP = false;

export function LocalGate({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/** Phone-only database tools; the cloud build has none. */
export function LocalDatabasePanel(_: { isAdmin: boolean }) {
  return null;
}
