"use client";
import { useEffect } from "react";
export function RecordFocus({ ready }: { ready: boolean }) {
  useEffect(() => {
    if (!ready) return;
    function focus() {
      const id = decodeURIComponent(location.hash.slice(1));
      if (!id.startsWith("record-")) return;
      const target = document.getElementById(id);
      target?.scrollIntoView({ block: "center" });
      target?.focus({ preventScroll: true });
    }
    focus(); window.addEventListener("hashchange", focus);
    return () => window.removeEventListener("hashchange", focus);
  }, [ready]);
  return null;
}
