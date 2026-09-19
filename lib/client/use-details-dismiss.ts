"use client";

import { useEffect, type RefObject } from "react";

export function useDismissibleDetails(
  ref: RefObject<HTMLDetailsElement | null>,
  options?: { mobileOnly?: boolean },
) {
  useEffect(() => {
    function shouldHandle() {
      return !options?.mobileOnly || window.matchMedia("(max-width: 1023px)").matches;
    }

    function close() {
      const details = ref.current;
      if (details?.open) details.removeAttribute("open");
    }

    function handlePointerDown(event: PointerEvent) {
      if (!shouldHandle()) return;
      const details = ref.current;
      if (!details?.open) return;
      if (event.target instanceof Node && !details.contains(event.target)) {
        close();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!shouldHandle() || event.key !== "Escape") return;
      close();
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [options?.mobileOnly, ref]);
}
