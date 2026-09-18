import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { googleCalendarConnections } from "@/lib/db/schema";
import { getGoogleCalendarConfig } from "@/lib/google-calendar/config";
import { decryptGoogleSecret, encryptGoogleSecret } from "@/lib/google-calendar/crypto";
import {
  GoogleApiError,
  type GoogleFetch,
  refreshAccessToken,
  revokeGoogleToken,
} from "@/lib/google-calendar/google-api";

export type GoogleConnection = typeof googleCalendarConnections.$inferSelect;

export class GoogleReconnectRequiredError extends Error {
  constructor(message = "Reconnect Google Calendar to continue syncing.") {
    super(message);
    this.name = "GoogleReconnectRequiredError";
  }
}

async function refreshConnection(connection: GoogleConnection, fetchImpl: GoogleFetch = fetch) {
  if (!connection.refreshTokenEncrypted) throw new GoogleReconnectRequiredError();
  const config = getGoogleCalendarConfig();
  let refreshToken: string;
  try {
    refreshToken = decryptGoogleSecret(connection.refreshTokenEncrypted, config.encryptionKey);
  } catch {
    throw new GoogleReconnectRequiredError();
  }

  try {
    const token = await refreshAccessToken(config, refreshToken, fetchImpl);
    const expiresAt = new Date(Date.now() + Math.max(60, token.expires_in) * 1000);
    const encrypted = encryptGoogleSecret(token.access_token, config.encryptionKey);
    await getDb()
      .update(googleCalendarConnections)
      .set({
        accessTokenEncrypted: encrypted,
        tokenExpiresAt: expiresAt,
        scope: token.scope ?? connection.scope,
        status: connection.status === "reconnect_required" ? "initial_sync" : connection.status,
        updatedAt: new Date(),
      })
      .where(eq(googleCalendarConnections.id, connection.id));
    return token.access_token;
  } catch (error) {
    if (error instanceof GoogleApiError && (error.status === 400 || error.status === 401)) {
      throw new GoogleReconnectRequiredError();
    }
    throw error;
  }
}

async function currentAccessToken(connection: GoogleConnection, fetchImpl: GoogleFetch = fetch) {
  const expiresSoon =
    !connection.tokenExpiresAt || connection.tokenExpiresAt.getTime() <= Date.now() + 60_000;
  if (!connection.accessTokenEncrypted || expiresSoon) return refreshConnection(connection, fetchImpl);
  try {
    return decryptGoogleSecret(connection.accessTokenEncrypted, getGoogleCalendarConfig().encryptionKey);
  } catch {
    return refreshConnection(connection, fetchImpl);
  }
}

export async function withGoogleAccess<T>(
  connection: GoogleConnection,
  operation: (accessToken: string) => Promise<T>,
  fetchImpl: GoogleFetch = fetch,
) {
  let accessToken = await currentAccessToken(connection, fetchImpl);
  try {
    return await operation(accessToken);
  } catch (error) {
    if (!(error instanceof GoogleApiError) || error.status !== 401) throw error;
    accessToken = await refreshConnection(connection, fetchImpl);
    return operation(accessToken);
  }
}

export async function revokeConnectionToken(connection: GoogleConnection, fetchImpl: GoogleFetch = fetch) {
  if (!connection.refreshTokenEncrypted && !connection.accessTokenEncrypted) return;
  const config = getGoogleCalendarConfig();
  const encrypted = connection.refreshTokenEncrypted ?? connection.accessTokenEncrypted;
  if (!encrypted) return;
  try {
    const token = decryptGoogleSecret(encrypted, config.encryptionKey);
    await revokeGoogleToken(token, fetchImpl);
  } catch {
    // Leaving the generated calendar in place must still permit local disconnection.
  }
}
