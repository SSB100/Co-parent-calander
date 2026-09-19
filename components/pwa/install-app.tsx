"use client";

import { Download, Share2, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

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

  if (installed || dismissed) return null;

  return (
    <section className="covie-install-mobile fixed inset-x-3 bottom-[calc(78px+env(safe-area-inset-bottom))] z-40 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl md:hidden">
      <button type="button" aria-label="Dismiss install prompt" onClick={() => setDismissed(true)} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="flex flex-col gap-3 pr-7">
        <div className="flex gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-700"><Smartphone className="h-5 w-5" aria-hidden="true" /></span>
          <div><h2 className="font-semibold text-slate-950">Add Covie to your phone</h2><p className="mt-1 text-sm leading-6 text-slate-600">Install Covie like an app on iPhone, iPad or Android. Your shared organiser stays one tap away.</p></div>
        </div>
        {prompt ? (
          <button type="button" onClick={() => void prompt.prompt()} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"><Download className="h-4 w-4" />Install app</button>
        ) : isIos ? (
          <p className="flex shrink-0 items-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-700"><Share2 className="h-4 w-4" />In Safari, tap Share, then Add to Home Screen.</p>
        ) : (
          <p className="shrink-0 text-sm text-slate-500">Use your browser menu and choose “Install app”.</p>
        )}
      </div>
    </section>
  );
}
