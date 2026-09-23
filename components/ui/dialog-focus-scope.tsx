"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Default modal focus behavior; custom dialog refs retain their existing hooks. */
export function DialogFocusScope({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!enabled) return;
    const dialog = root.current?.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const topmost = () => Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]')).at(-1) === dialog;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]'))
      .filter(element => element.tabIndex >= 0 && !element.matches(':disabled, [hidden]') && element.getClientRects().length > 0);
    const keepFocus = (event: FocusEvent) => {
      if (topmost() && event.target instanceof Node && !dialog.contains(event.target)) dialog.focus();
    };
    const cycle = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !topmost()) return;
      const elements = focusable();
      const first = elements[0];
      const last = elements.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
        event.preventDefault(); first.focus();
      }
    };
    if (!dialog.contains(document.activeElement)) dialog.focus();
    document.addEventListener('focusin', keepFocus);
    dialog.addEventListener('keydown', cycle);
    return () => {
      document.removeEventListener('focusin', keepFocus);
      dialog.removeEventListener('keydown', cycle);
      if (previous?.isConnected) previous.focus();
    };
  }, [enabled]);
  return <div ref={root} className="contents">{children}</div>;
}
