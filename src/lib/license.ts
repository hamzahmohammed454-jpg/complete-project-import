export type LicenseStatus = { id: string; company_name: string; trial_started_at: string; trial_ends_at: string; activated: boolean; licensed_until: string | null; can_write: boolean; is_owner: boolean };
/** Calendar month in Aden; end-of-month starts clamp to the last target-month day. */
export function trialEnd(start: string): string {
  const aden = new Date(new Date(start).getTime() + 3 * 60 * 60 * 1000);
  const day = aden.getUTCDate();
  aden.setUTCDate(1); aden.setUTCMonth(aden.getUTCMonth() + 1);
  const last = new Date(Date.UTC(aden.getUTCFullYear(), aden.getUTCMonth() + 1, 0)).getUTCDate();
  aden.setUTCDate(Math.min(day, last));
  return new Date(aden.getTime() - 3 * 60 * 60 * 1000).toISOString();
}
export function licenseAllowsWrites(status: Pick<LicenseStatus, "activated" | "licensed_until" | "trial_ends_at">, now: string): boolean {
  const time = Date.parse(now);
  if (!Number.isFinite(time)) return false;
  return status.activated ? status.licensed_until === null || Date.parse(status.licensed_until) > time : Date.parse(status.trial_ends_at) > time;
}