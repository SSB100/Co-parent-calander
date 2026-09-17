import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const AAD = Buffer.from("coparent-google-token-v1", "utf8");

function encryptionKey(value = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY) {
  if (!value) throw new Error("Google token encryption is not configured.");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be a base64 encoded 32-byte key.");
  }
  return key;
}

export function encryptGoogleSecret(value: string, keyValue?: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(keyValue), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptGoogleSecret(value: string, keyValue?: string) {
  const [version, ivValue, tagValue, ciphertextValue] = value.split(".");
  if (version !== VERSION || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Encrypted Google credential has an unsupported format.");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(keyValue), Buffer.from(ivValue, "base64url"));
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
