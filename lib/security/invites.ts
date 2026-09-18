import { randomBytes } from "node:crypto";

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export const NEW_CALENDAR_INVITE_COOKIE_NAME = "covie_new_calendar_invite";

export function normalizeInviteCode(value: string) {
  return value.toUpperCase().replace(/[^2-9A-HJ-NP-Z]/g, "");
}

export function generateInviteCode() {
  const bytes = randomBytes(12);
  let raw = "";
  for (const byte of bytes) raw += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}
