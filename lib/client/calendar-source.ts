import { safeSourceDate } from "@/lib/personal/source-navigation";
/** A navigation hint only. It never selects a calendar or grants source access. */
export function initialSourceDate() {
  return typeof window === "undefined" ? "" : safeSourceDate(new URLSearchParams(window.location.search).get("date"));
}
export function initialSourceRecord() {
  if (typeof window === "undefined") return "";
  const value = new URLSearchParams(window.location.search).get("record") || "";
  return /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value) ? value : "";
}
