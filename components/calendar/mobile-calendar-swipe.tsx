"use client";

import { useEffect } from "react";

const mobileQuery = "(max-width: 767px)";
const minimumSwipeDistance = 56;
const horizontalIntentRatio = 1.2;

type SwipeStart = {
  x: number;
  y: number;
  grid: HTMLElement;
};

function calendarGridFrom(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const grid = target.closest('[role="grid"]');
  if (!(grid instanceof HTMLElement)) return null;
  const section = grid.closest("section");
  if (!section) return null;
  if (!section.querySelector('button[aria-label="Previous month"]')) return null;
  if (!section.querySelector('button[aria-label="Next month"]')) return null;
  return grid;
}

export function MobileCalendarSwipe() {
  useEffect(() => {
    let start: SwipeStart | null = null;

    function onTouchStart(event: TouchEvent) {
      if (!window.matchMedia(mobileQuery).matches || event.touches.length !== 1) {
        start = null;
        return;
      }

      const grid = calendarGridFrom(event.target);
      if (!grid) {
        start = null;
        return;
      }

      const touch = event.touches[0];
      start = { x: touch.clientX, y: touch.clientY, grid };
    }

    function onTouchEnd(event: TouchEvent) {
      const gesture = start;
      start = null;

      if (!gesture || !window.matchMedia(mobileQuery).matches || event.changedTouches.length !== 1) {
        return;
      }
      if (!gesture.grid.isConnected) return;

      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - gesture.x;
      const deltaY = touch.clientY - gesture.y;
      const horizontalDistance = Math.abs(deltaX);
      const verticalDistance = Math.abs(deltaY);

      if (horizontalDistance < minimumSwipeDistance) return;
      if (horizontalDistance <= verticalDistance * horizontalIntentRatio) return;

      const section = gesture.grid.closest("section");
      if (!section) return;

      // Do not wipe a multi-day selection just because the user swiped while selecting.
      if (section.querySelector('button[aria-pressed="true"]')) return;

      const direction = deltaX < 0 ? "Next" : "Previous";
      const monthButton = section.querySelector<HTMLButtonElement>(
        `button[aria-label="${direction} month"]`,
      );
      if (!monthButton) return;

      // Prevent the original touch from also becoming a click on the day underneath it.
      event.preventDefault();
      monthButton.click();
    }

    function onTouchCancel() {
      start = null;
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: false });
    document.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchCancel);
    };
  }, []);

  return null;
}
