import "./support/salon-dom-environment";
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { dom, styleHooks } from "./support/salon-dom-environment";
import type { SalonSlot } from "../lib/salon/contracts";

let Times: typeof import("../components/salon/salon-available-times").SalonAvailableTimes;
let root: Root, container: HTMLDivElement;
const slots: SalonSlot[] = [
  { practitionerId: "a", start: "2026-10-01T20:07:00Z", end: "2026-10-01T20:37:00Z" },
  { practitionerId: "b", start: "2026-10-02T00:15:00Z", end: "2026-10-02T00:45:00Z" },
  { practitionerId: "a", start: "2026-10-02T05:00:00Z", end: "2026-10-02T05:30:00Z" },
];
before(async () => { ({ SalonAvailableTimes: Times } = await import("../components/salon/salon-available-times")); });
beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
after(() => { styleHooks.deregister(); dom.window.close(); });
test("time filters use the salon timezone and return the exact unrounded candidate", async () => {
  let chosen: SalonSlot | undefined;
  await act(async () => root.render(<Times slots={slots} timezone="Pacific/Auckland" disabled={false} practitioners={[{ id: "a", displayName: "Alex" }, { id: "b", displayName: "Blair" }]} onChoose={slot => { chosen = slot; }} />));
  assert.equal(container.querySelectorAll("section").length, 3);
  const morning = [...container.querySelectorAll("button")].find(button => button.textContent === "Morning")!;
  await act(async () => morning.click());
  const candidates = container.querySelectorAll<HTMLButtonElement>("section button");
  assert.equal(candidates.length, 1);
  assert.match(candidates[0].getAttribute("aria-label")!, /9:07 am.*Alex/);
  await act(async () => candidates[0].click());
  assert.equal(chosen, slots[0]);
});
test("a refreshed list drops an unavailable period and disabled candidates cannot select", async () => {
  let count = 0;
  const render = (items: SalonSlot[], disabled = false) => act(async () => root.render(<Times slots={items} timezone="Pacific/Auckland" disabled={disabled} onChoose={() => { count++; }} />));
  await render(slots);
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Evening")!.click());
  await render([slots[0]], true);
  const candidate = container.querySelector<HTMLButtonElement>("section button")!;
  assert.match(candidate.textContent!, /9:07 am/);
  assert.equal(candidate.disabled, true);
  await act(async () => candidate.click());
  assert.equal(count, 0);
});
