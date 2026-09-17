import type { getGoogleCalendarConfig } from "@/lib/google-calendar/config";

type GoogleConfig = ReturnType<typeof getGoogleCalendarConfig>;
export type GoogleFetch = typeof fetch;

export class GoogleApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GoogleApiError";
  }
}

async function googleJson<T>(
  url: string,
  init: RequestInit,
  fetchImpl: GoogleFetch = fetch,
): Promise<T> {
  const response = await fetchImpl(url, init);
  if (!response.ok) {
    throw new GoogleApiError(`Google Calendar request failed (${response.status}).`, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function exchangeAuthorizationCode(
  config: GoogleConfig,
  code: string,
  verifier: string,
  fetchImpl: GoogleFetch = fetch,
) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  });
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new GoogleApiError(`Google authorization could not be completed (${response.status}).`, response.status);
  }
  return (await response.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    scope?: string;
    token_type: string;
  };
}

export async function refreshAccessToken(
  config: GoogleConfig,
  refreshToken: string,
  fetchImpl: GoogleFetch = fetch,
) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new GoogleApiError(`Google authorization needs to be renewed (${response.status}).`, response.status);
  }
  return (await response.json()) as {
    access_token: string;
    expires_in: number;
    scope?: string;
    token_type: string;
  };
}

function calendarApiUrl(path: string) {
  return `https://www.googleapis.com/calendar/v3${path}`;
}

function authHeaders(accessToken: string, json = true) {
  return {
    authorization: `Bearer ${accessToken}`,
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

export async function createSecondaryCalendar(
  accessToken: string,
  input: { summary: string; timeZone: string },
  fetchImpl: GoogleFetch = fetch,
) {
  return googleJson<{ id: string; summary?: string }>(
    calendarApiUrl("/calendars"),
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify(input),
    },
    fetchImpl,
  );
}

export async function updateSecondaryCalendar(
  accessToken: string,
  calendarId: string,
  input: { summary: string; timeZone: string },
  fetchImpl: GoogleFetch = fetch,
) {
  return googleJson<{ id: string; summary?: string }>(
    calendarApiUrl(`/calendars/${encodeURIComponent(calendarId)}`),
    {
      method: "PATCH",
      headers: authHeaders(accessToken),
      body: JSON.stringify(input),
    },
    fetchImpl,
  );
}

export async function deleteSecondaryCalendar(
  accessToken: string,
  calendarId: string,
  fetchImpl: GoogleFetch = fetch,
) {
  return googleJson<void>(
    calendarApiUrl(`/calendars/${encodeURIComponent(calendarId)}`),
    { method: "DELETE", headers: authHeaders(accessToken, false) },
    fetchImpl,
  );
}

export async function upsertManagedEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  body: Record<string, unknown>,
  preferUpdate: boolean,
  fetchImpl: GoogleFetch = fetch,
) {
  const base = calendarApiUrl(`/calendars/${encodeURIComponent(calendarId)}/events`);
  const update = () =>
    googleJson<Record<string, unknown>>(
      `${base}/${encodeURIComponent(eventId)}`,
      {
        method: "PUT",
        headers: authHeaders(accessToken),
        body: JSON.stringify({ ...body, id: eventId }),
      },
      fetchImpl,
    );
  const insert = () =>
    googleJson<Record<string, unknown>>(
      base,
      {
        method: "POST",
        headers: authHeaders(accessToken),
        body: JSON.stringify({ ...body, id: eventId }),
      },
      fetchImpl,
    );

  if (preferUpdate) {
    try {
      return await update();
    } catch (error) {
      if (!(error instanceof GoogleApiError) || error.status !== 404) throw error;
      return insert();
    }
  }

  try {
    return await insert();
  } catch (error) {
    if (!(error instanceof GoogleApiError) || error.status !== 409) throw error;
    return update();
  }
}

export async function deleteManagedEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  fetchImpl: GoogleFetch = fetch,
) {
  try {
    await googleJson<void>(
      calendarApiUrl(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`),
      { method: "DELETE", headers: authHeaders(accessToken, false) },
      fetchImpl,
    );
  } catch (error) {
    if (error instanceof GoogleApiError && error.status === 404) return;
    throw error;
  }
}

export async function revokeGoogleToken(token: string, fetchImpl: GoogleFetch = fetch) {
  const body = new URLSearchParams({ token });
  const response = await fetchImpl("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok && response.status !== 400) {
    throw new GoogleApiError(`Google token revocation failed (${response.status}).`, response.status);
  }
}
