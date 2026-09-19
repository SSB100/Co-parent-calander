"use client";

import { Download, Share2, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const standalone = window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
      setInstalled(standalone);
      setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    });

    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const handleInstalled = () => {
      setInstalled(true);
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

  if (installed) return null;

  return (
    <section className="covie-install-mobile fixed bottom-[calc(78px+env(safe-area-inset-bottom))] left-2 right-2 z-30 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-xl sm:hidden">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
            <Smartphone className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-5 text-slate-950">Add Covie to your phone</h2>
            <p className="mt-0.5 text-xs leading-4 text-slate-600">Keep your shared organiser one tap away.</p>
          </div>
        </div>

        {prompt ? (
          <button
            type="button"
            onClick={() => void prompt.prompt()}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Install app
          </button>
        ) : isIos ? (
          <p className="flex w-full min-w-0 items-start gap-2 rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-medium leading-4 text-slate-700">
            <Share2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0">In Safari, tap Share, then Add to Home Screen.</span>
          </p>
        ) : (
          <p className="w-full min-w-0 rounded-xl bg-slate-100 px-3 py-2.5 text-xs leading-4 text-slate-600">
            Use your browser menu and choose “Install app”.
          </p>
        )}
      </div>
    </section>
  );
}
