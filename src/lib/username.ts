/** Staff sign in with a username; auth needs an email, so each username maps to a fixed internal address. */
export const STAFF_EMAIL_DOMAIN = "staff.sarraf.app";

export function normalizeUsername(u: string): string {
  return u.trim().toLowerCase();
}

export function isValidUsername(u: string): boolean {
  return /^[a-z0-9._-]{3,30}$/.test(normalizeUsername(u));
}

export function usernameToEmail(u: string): string {
  return `${normalizeUsername(u)}@${STAFF_EMAIL_DOMAIN}`;
}
