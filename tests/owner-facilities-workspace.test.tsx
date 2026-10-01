import "./support/salon-dom-environment";
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { facilityDefaults, type FacilityData } from "../lib/shared-facilities/contracts";
import { dom, styleHooks } from "./support/salon-dom-environment";
let Page: typeof import("../components/shared-facilities/facilities-page").FacilitiesPage;
let root: Root, container: HTMLDivElement;
const fetchOriginal = globalThis.fetch;
const calendarId="10000000-0000-4000-8000-000000000001", roomA="20000000-0000-4000-8000-000000000001", roomB="20000000-0000-4000-8000-000000000002", record="30000000-0000-4000-8000-000000000001";
const date=new Date(Date.now()+86400000).toISOString().slice(0,10), base=`/calendar-types/shared-facilities?date=${date}`;
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
function fixture():FacilityData {return {calendarId,date,timezone:"UTC",owner:true,role:"owner",canBook:true,managedResourceIds:[],rules:facilityDefaults,updates:[],resources:[{id:roomA,name:"Room A",description:"",location:"",capacity:4,active:true},{id:roomB,name:"Room B",description:"",location:"",capacity:2,active:true}],bookings:[{id:record,resourceId:roomA,title:"Synthetic booking",notes:"Private fixture",start:`${date}T09:07:00Z`,end:`${date}T10:07:00Z`,status:"confirmed",own:true,canManage:true,version:1}]};}
function button(label:string,scope:ParentNode=document){const value=[...scope.querySelectorAll<HTMLButtonElement>("button")].find(e=>e.textContent?.trim()===label);assert.ok(value,`Missing ${label}`);return value;}
async function settle(check:()=>void){let last:unknown;for(let i=0;i<60;i++){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,5));});try{check();return;}catch(error){last=error;}}throw last;}
async function click(element:HTMLElement){await act(async()=>element.click());}
async function render(initialRecord=""){await act(async()=>root.render(<Page calendarId={calendarId} section="calendar" initialDate={date} initialRecord={initialRecord}/>));await settle(()=>button("Resources"));}
before(async()=>{({FacilitiesPage:Page}=await import("../components/shared-facilities/facilities-page"));});
beforeEach(()=>{window.history.replaceState(null,"",base);container=document.createElement("div");document.body.append(container);root=createRoot(container);globalThis.fetch=async()=>json(fixture());});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();globalThis.fetch=fetchOriginal;});
after(()=>{styleHooks.deregister();dom.window.close();});

test("owner tools stay visible and Back/Forward keeps the timetable mounted",async()=>{
 await render();const table=container.querySelector('[aria-label="Resource day schedule"]');assert.ok(table);
 for(const label of ["Resources","Booking rules","Members","My bookings","Requests"])assert.equal(button(label).disabled,false);
 await click(button("Booking rules"));await settle(()=>assert.ok(document.querySelector('[role="dialog"]')));
 assert.equal(container.querySelector('[aria-label="Resource day schedule"]'),table);
 await act(async()=>window.history.back());await settle(()=>assert.equal(document.querySelector('[role="dialog"]'),null));
 await act(async()=>window.history.forward());await settle(()=>assert.ok(document.querySelector('[role="dialog"]')));
 await click(button("Back to calendar"));await settle(()=>assert.equal(document.querySelector('[role="dialog"]'),null));
 assert.equal(window.location.search,`?date=${date}`);
});

test("an exact start in another resource binds confirmation to that resource before save",async()=>{
 const payloads:{data:{resourceId:string}}[]=[];const headers:string[]=[];
 globalThis.fetch=async(_input,init)=>{headers.push(new Headers(init?.headers).get("x-covie-calendar-id")??"");if(init?.method==="POST"){payloads.push(JSON.parse(String(init.body)));return json({ok:true,status:"confirmed"});}return json(fixture());};
 await render();
 const hour=[...container.querySelectorAll<HTMLButtonElement>("button")].find(e=>e.getAttribute("aria-label")?.startsWith("Room B, 4 available 60-minute starts from 8:00 am"));assert.ok(hour);await click(hour);
 await settle(()=>assert.match(document.querySelector('[role="dialog"]')?.textContent??"",/Choose a start time/));
 const start=[...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(e=>e.querySelector("strong")?.textContent==="8:00 am");assert.ok(start);await click(start);
 await settle(()=>assert.match(document.querySelector('[role="dialog"]')?.textContent??"",/Confirm your booking/));
 assert.match(document.querySelector('[role="dialog"]')?.textContent??"",/Room B/);
 await act(async()=>document.querySelector('#facility-slot-form')!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
 await settle(()=>assert.equal(payloads.length,1));
 assert.equal(payloads[0].data.resourceId,roomB);assert.ok(headers.every(value=>value===calendarId));
});

test("denied embedded member access clears the whole owner calendar",async()=>{
 globalThis.fetch=async input=>String(input).includes("template-members")?json({error:"Access removed"},403):json(fixture());
 await render();await click(button("Members"));
 await settle(()=>assert.match(container.textContent??"",/Your calendar access changed/));
 assert.equal(document.querySelector('[role="dialog"]'),null);assert.equal(container.querySelector('[data-owner-workspace]'),null);assert.doesNotMatch(container.textContent??"",/Synthetic booking/);
});

test("owner demotion closes a resource editor and returns to the existing member planner",async()=>{
 let current=fixture();globalThis.fetch=async()=>json(current);
 await render();await click(button("Resources"));await click(button("Add resource"));assert.equal(document.querySelectorAll('[role="dialog"]').length,2);
 current={...current,owner:false,role:"member"};await act(async()=>window.dispatchEvent(new Event("focus")));
 await settle(()=>assert.equal(document.querySelector('[role="dialog"]'),null));assert.equal(container.querySelector('[data-owner-workspace]'),null);
 assert.ok(container.querySelector('[aria-label="Facilities view"]'));assert.equal(new URL(window.location.href).searchParams.has("panel"),false);
});

test("Back closes an owner tool and its nested unsaved resource form",async()=>{
 await render();await click(button("Resources"));await click(button("Add resource"));
 await act(async()=>window.history.back());await settle(()=>assert.equal(document.querySelector('[role="dialog"]'),null));
 assert.equal(window.location.search,`?date=${date}`);
});

test("a cancelled source booking on an archived resource retains readable detail without offering new starts",async()=>{
 const current=fixture();current.resources[0].active=false;current.bookings[0].status="cancelled";globalThis.fetch=async()=>json(current);
 await render(record);await settle(()=>assert.match(container.querySelector('[aria-label="Selected day workspace"]')?.textContent??"",/Booking from Personal/));
 assert.match(container.querySelector('[aria-label="Selected day workspace"]')?.textContent??"",/Synthetic booking|Cancelled/);
 assert.match(container.querySelector('[aria-label="Resource day schedule"]')?.textContent??"",/archived/i);
 assert.equal([...container.querySelectorAll("button")].some(e=>e.getAttribute("aria-label")?.includes("available 60-minute")),false);
});
