/** Only known in-app booking destinations may survive an authentication round trip. */
export function safeAuthReturnTo(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 400 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  )
    return "";
  const uuid = "[a-f\\d]{8}(?:-[a-f\\d]{4}){3}-[a-f\\d]{12}";
  let parsed: URL;
  try {
    parsed = new URL(value, "https://covie.invalid");
  } catch {
    return "";
  }
  if (parsed.origin !== "https://covie.invalid" || parsed.hash) return "";
  if (parsed.pathname === "/personal" && !parsed.search) return "/personal";
  if (!new RegExp(`^/booking/(?:manage/)?${uuid}$`, "i").test(parsed.pathname))
    return "";
  const params = new URLSearchParams();
  for (const [key, entry] of parsed.searchParams) {
    if (key === "date" && !parsed.pathname.includes("/manage/")) {
      const date = new Date(`${entry}T12:00:00Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(entry) ||
        Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== entry ||
        params.has(key)
      )
        return "";
      params.set(key, entry);
      continue;
    }
    if (
      !["practitioner", "service"].includes(key) ||
      !new RegExp(`^${uuid}$`, "i").test(entry) ||
      params.has(key)
    )
      return "";
    params.set(key, entry);
  }
  return `${parsed.pathname}${params.size ? `?${params}` : ""}`;
}
