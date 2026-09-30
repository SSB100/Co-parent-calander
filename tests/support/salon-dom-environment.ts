import { registerHooks } from "node:module";
import { JSDOM } from "jsdom";

// Node owns transport/timers; jsdom supplies DOM and native event semantics.
// No external resources or scripts are enabled in this synthetic document.
export const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://covie.example.invalid/",
  pretendToBeVisual: true,
});

for (const key of [
  "window",
  "self",
  "document",
  "navigator",
  "Node",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLSelectElement",
  "HTMLButtonElement",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
  "FocusEvent",
  "MutationObserver",
  "getComputedStyle",
] as const) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: dom.window[key],
  });
}
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

// Styles have no layout in jsdom. Keep their names for querying rendered DOM;
// every React component, hook, dialog and event handler remains real code.
export const styleHooks = registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith(".module.css")) {
      return {
        format: "module",
        shortCircuit: true,
        source:
          "export default new Proxy({}, { get: (_, key) => String(key) });",
      };
    }
    return nextLoad(url, context);
  },
});
