"use client";

import { Download, Share2, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_UNTIL_KEY = "covie-install-dismissed-until";
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000;

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [visible, setVisible] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        ("standalone" in navigator &&
          Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
      setInstalled(standalone);
      setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));

      if (!standalone) {
        let dismissedUntil = 0;
        try {
          dismissedUntil = Number(window.localStorage.getItem(DISMISSED_UNTIL_KEY) ?? 0);
        } catch {}
        setVisible(!Number.isFinite(dismissedUntil) || dismissedUntil <= Date.now());
      }
    });

    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setVisible(false);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    function handleOpenInstall() {
      if (installed) return;
      try {
        window.localStorage.removeItem(DISMISSED_UNTIL_KEY);
      } catch {}
      setShowInstructions(false);
      setVisible(true);
    }

    window.addEventListener("covie-open-install", handleOpenInstall);
    return () => window.removeEventListener("covie-open-install", handleOpenInstall);
  }, [installed]);

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISSED_UNTIL_KEY, String(Date.now() + DISMISS_FOR_MS));
    } catch {}
    setVisible(false);
    setShowInstructions(false);
  }

  async function install() {
    if (prompt) {
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice.catch(() => null);
        if (choice?.outcome === "accepted") {
          setVisible(false);
          return;
        }
      } catch {
        // Fall through to the browser-specific instructions below.
      } finally {
        setPrompt(null);
      }
    }
    setShowInstructions(true);
  }

  if (installed || !visible) return null;

  return (
    <section
      className="covie-install-mobile fixed bottom-[calc(78px+env(safe-area-inset-bottom))] left-2 right-2 z-30 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-[#243139] bg-white p-3 shadow-[5px_5px_0_#19A897] sm:hidden"
      aria-label="Install Covie"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Close install Covie prompt"
        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>

      <div className="flex min-w-0 flex-col gap-3 pr-8">
        <div className="flex min-w-0 gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
            <Smartphone className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-5 text-slate-950">Add Covie to your phone</h2>
            <p className="mt-0.5 text-xs leading-4 text-slate-600">Open Covie like an app and keep it one tap away.</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void install()}
          aria-expanded={showInstructions}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#243139] px-4 text-sm font-semibold text-white hover:bg-[#35474F]"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Install Covie
        </button>

        {showInstructions ? (
          isIos ? (
            <p className="flex w-full min-w-0 items-start gap-2 rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-medium leading-4 text-slate-700">
              <Share2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">In Safari, tap Share, then choose Add to Home Screen.</span>
            </p>
          ) : (
            <p className="w-full min-w-0 rounded-xl bg-slate-100 px-3 py-2.5 text-xs leading-4 text-slate-600">
              If your browser does not open an install prompt, open its menu and choose Install app or Add to Home screen.
            </p>
          )
        ) : null}
      </div>
    </section>
  );
}
