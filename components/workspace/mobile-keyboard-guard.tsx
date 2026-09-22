"use client";

import { useEffect } from "react";

const editableSelector =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), textarea, select, [contenteditable="true"]';

export function MobileKeyboardGuard() {
  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return;
    const activeViewport: VisualViewport = visualViewport;

    const root = document.documentElement;
    let frame = 0;
    let focusTimer = 0;

    function syncViewport() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const visualHeight = Math.round(activeViewport.height);
        const visualTop = Math.round(activeViewport.offsetTop);
        const keyboardHeight = Math.max(
          0,
          Math.round(window.innerHeight - visualHeight - visualTop),
        );

        root.style.setProperty(
          "--covie-visual-viewport-height",
          `${visualHeight}px`,
        );
        root.style.setProperty(
          "--covie-visual-viewport-top",
          `${visualTop}px`,
        );
        root.style.setProperty(
          "--covie-keyboard-height",
          `${keyboardHeight}px`,
        );

        if (keyboardHeight > 120) {
          root.dataset.covieKeyboardOpen = "true";
        } else {
          delete root.dataset.covieKeyboardOpen;
        }
      });
    }

    function keepFocusedFieldVisible(target: EventTarget | null) {
      if (!(target instanceof HTMLElement) || !target.matches(editableSelector)) {
        return;
      }

      window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(() => {
        syncViewport();
        target.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: "smooth",
        });
      }, 220);
    }

    function handleFocusIn(event: FocusEvent) {
      keepFocusedFieldVisible(event.target);
    }

    function handleFocusOut() {
      window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(syncViewport, 120);
    }

    syncViewport();
    activeViewport.addEventListener("resize", syncViewport);
    activeViewport.addEventListener("scroll", syncViewport);
    window.addEventListener("orientationchange", syncViewport);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(focusTimer);
      activeViewport.removeEventListener("resize", syncViewport);
      activeViewport.removeEventListener("scroll", syncViewport);
      window.removeEventListener("orientationchange", syncViewport);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      root.style.removeProperty("--covie-visual-viewport-height");
      root.style.removeProperty("--covie-visual-viewport-top");
      root.style.removeProperty("--covie-keyboard-height");
      delete root.dataset.covieKeyboardOpen;
    };
  }, []);

  return null;
}
