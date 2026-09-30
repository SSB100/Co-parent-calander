const memory = new Set<string>();
export const setupGuidePreferenceEvent = "covie-setup-guide-preference";
export function setupGuidePreferenceKey(accountScope: string, calendarId: string) {
  return `covie:setup-guide:v1:${encodeURIComponent(accountScope)}:${encodeURIComponent(calendarId)}`;
}
export function setupGuideIsDismissed(key: string) {
  if (memory.has(key)) return true;
  try { if (window.localStorage.getItem(key) === "dismissed") return true; } catch { /* Storage may be disabled. */ }
  try { return window.sessionStorage.getItem(key) === "dismissed"; } catch { return false; }
}
export function dismissSetupGuide(key: string) {
  memory.add(key);
  try { window.localStorage.setItem(key, "dismissed"); } catch { /* Keep the preference in this tab when persistent storage is unavailable. */ }
  try { window.sessionStorage.setItem(key, "dismissed"); } catch { /* The in-memory fallback still survives client navigation. */ }
  window.dispatchEvent(new Event(setupGuidePreferenceEvent));
}
