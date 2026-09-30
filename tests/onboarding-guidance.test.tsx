import "./support/salon-dom-environment";
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { calendarGuides } from "../lib/onboarding/calendar-guides";
import { setupGuidePreferenceKey } from "../lib/onboarding/guide-preferences";
import { dom, styleHooks } from "./support/salon-dom-environment";
let Guide: typeof import("../components/onboarding/calendar-setup-guide").CalendarSetupGuide;
let root: Root, container: HTMLDivElement;
let fixture = 0;
before(async () => { ({ CalendarSetupGuide: Guide } = await import("../components/onboarding/calendar-setup-guide")); });
beforeEach(() => { fixture++; container=document.createElement("div");document.body.append(container);root=createRoot(container); });
afterEach(async () => { await act(async()=>root.unmount());container.remove(); });
after(()=>{styleHooks.deregister();dom.window.close();});
const calendarId = () => `synthetic-calendar-${fixture}`;
async function render(accountScope = "synthetic-account-a", id = calendarId()) { await act(async()=>root.render(<Guide accountScope={accountScope} calendarId={id} type="shared_facilities" />)); }
async function dismiss() { const button=container.querySelector<HTMLButtonElement>('[aria-label="Dismiss setup guide"]');assert.ok(button);await act(async()=>button.click()); }

test("setup guidance gives a concrete first action and can be dismissed without creating anything",async()=>{
 await render();assert.match(container.textContent??"",/Add the first room/);assert.equal(container.querySelectorAll("ol li").length,3);
 assert.equal(container.querySelector("a")?.getAttribute("href"),calendarGuides.shared_facilities.startPath);
 await dismiss();assert.equal(container.textContent,"");
 assert.equal(window.localStorage.getItem(setupGuidePreferenceKey("synthetic-account-a",calendarId())),"dismissed");
});
test("dismissal survives remounting while another account and another calendar keep independent choices",async()=>{
 await render();await dismiss();await act(async()=>root.render(null));await render();assert.equal(container.textContent,"");
 await render("synthetic-account-b");assert.match(container.textContent??"",/get started/);
 await render("synthetic-account-a",`${calendarId()}-other`);assert.match(container.textContent??"",/get started/);
});
test("an existing dismissal is hidden before hydration and a storage event closes another tab's guide",async()=>{
 const key=setupGuidePreferenceKey("synthetic-account-a",calendarId());
 const server=renderToString(<Guide accountScope="synthetic-account-a" calendarId={calendarId()} type="shared_facilities" />);assert.equal(server,"");
 await render();assert.ok(container.querySelector("section"));
 await act(async()=>{window.localStorage.setItem(key,"dismissed");window.dispatchEvent(new dom.window.StorageEvent("storage",{key,newValue:"dismissed"}));});
 assert.equal(container.textContent,"");
});
test("starting setup dismisses the invitation to start without changing the link destination",async()=>{
 await render();const link=container.querySelector("a");assert.ok(link);const destination=link.getAttribute("href");
 // Prevent only jsdom navigation; the actual React click and preference handler run.
 link.addEventListener("click",event=>event.preventDefault());await act(async()=>link.click());
 assert.equal(destination,"/calendar-types/shared-facilities/organiser/resources");assert.equal(container.textContent,"");
});
test("every optional template explains its purpose and three bounded setup steps",()=>{
 for(const guide of Object.values(calendarGuides)){assert.ok(guide.example);assert.ok(guide.purpose);assert.equal(guide.steps.length,3);assert.ok(guide.startPath.startsWith("/calendar"));}
 assert.match(calendarGuides.salon_bookings.steps[2],/Enable client booking only when ready/);
 assert.match(calendarGuides.staff_rosters.steps[2],/Publish when ready/);
 assert.match(calendarGuides.co_parenting.steps[2],/when you are ready/);
});

test("blocked browser storage still lets someone dismiss the guide for this tab",async()=>{
 const local=Object.getOwnPropertyDescriptor(window,"localStorage")!, session=Object.getOwnPropertyDescriptor(window,"sessionStorage")!;
 Object.defineProperty(window,"localStorage",{configurable:true,get(){throw new Error("Synthetic storage denial");}});
 Object.defineProperty(window,"sessionStorage",{configurable:true,get(){throw new Error("Synthetic storage denial");}});
 try {await render();await dismiss();assert.equal(container.textContent,"");await act(async()=>root.render(null));await render();assert.equal(container.textContent,"");}
 finally {Object.defineProperty(window,"localStorage",local);Object.defineProperty(window,"sessionStorage",session);}
});
