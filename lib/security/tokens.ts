import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;

export function generateSecureToken() {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function looksLikeSecureToken(token: string) {
  return token.length >= 40 && token.length <= 128 && /^[A-Za-z0-9_-]+$/.test(token);
}
