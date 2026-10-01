import { salonDefaults, type SalonData } from "@/lib/salon/contracts";
import { facilityDefaults, type FacilityData } from "@/lib/shared-facilities/contracts";
import type { PersonalData } from "@/lib/personal/contracts";
import type { SocialData } from "@/lib/social-groups/contracts";
export const date="2026-10-02", calendarId="10000000-0000-4000-8000-000000000001";
const practitionerId="20000000-0000-4000-8000-000000000001", otherPractitionerId="20000000-0000-4000-8000-000000000002", serviceId="30000000-0000-4000-8000-000000000001", appointmentId="40000000-0000-4000-8000-000000000001";
const roomA=practitionerId, roomB=otherPractitionerId, record=serviceId;
export function salonFixture(day = date): SalonData {
  return {
    calendarId, date: day, timezone: "UTC", role: "owner", ownPractitionerId: practitionerId,
    canOrganise: true, canPublish: true, settings: { ...salonDefaults, businessName: "Synthetic Salon", leadMinutes: 0 },
    practitioners: [
      { id: practitionerId, displayName: "Alice", bio: "", role: "owner", kind: "staff", active: true, bookable: true, own: true, serviceIds: [serviceId] },
      { id: otherPractitionerId, displayName: "Blair", bio: "", role: "practitioner", kind: "contractor", active: true, bookable: true, own: false, serviceIds: [serviceId] },
    ],
    services: [{ id: serviceId, name: "Synthetic cut", description: "", durationMinutes: 30, bufferBeforeMinutes: 10, bufferAfterMinutes: 10, priceMinor: 5000, currency: "NZD", active: true, bookable: true }],
    hours: [{ id: "hours", practitionerId, weekday: new Date(`${day}T12:00:00Z`).getUTCDay(), startMinute: 480, endMinute: 1080 }],
    appointments: [{ id: appointmentId, practitionerId, practitionerName: "Alice", serviceId, serviceName: "Synthetic cut", durationMinutes: 30, bufferBeforeMinutes: 10, bufferAfterMinutes: 10, priceMinor: 5000, currency: "NZD", cancellationHours: 24, start: `${day}T09:00:00Z`, end: `${day}T09:30:00Z`, busyStart: `${day}T08:50:00Z`, busyEnd: `${day}T09:40:00Z`, status: "confirmed", version: 1, clientName: "Synthetic Client", clientEmail: "private@example.invalid", clientPhone: "Private phone", notes: "Private appointment note", ownClient: false, ownPractitioner: true, canManage: true, canCancel: true, canReschedule: true }],
    appointmentsTruncated: false, updates: [], invitations: [],
    timeBlocks: [{ id: "50000000-0000-4000-8000-000000000001", practitionerId, start: `${day}T12:00:00Z`, end: `${day}T13:00:00Z`, reason: "Private block reason", active: true }],
  };
}
export function facilitiesFixture():FacilityData {return {calendarId,date,timezone:"UTC",owner:true,role:"owner",canBook:true,managedResourceIds:[],rules:facilityDefaults,updates:[],resources:[{id:roomA,name:"Room A",description:"",location:"",capacity:4,active:true},{id:roomB,name:"Room B",description:"",location:"",capacity:2,active:true}],bookings:[{id:record,resourceId:roomA,title:"Synthetic booking",notes:"Private fixture",start:`${date}T09:07:00Z`,end:`${date}T10:07:00Z`,status:"confirmed",own:true,canManage:true,version:1}]};}

export function personalFixture(): PersonalData {
 const sources: PersonalData["sources"] = [{id:calendarId,name:"Community sports and shared meeting spaces",type:"shared_facilities",timezone:"UTC"}];
 const items: PersonalData["items"] = Array.from({length:12},(_,i)=>({id:`plan-${i}`,calendarId,sourceId:`source-${i}`,kind:"facility",state:i%3===0?"tentative":"confirmed",title:["Court booking with the Wednesday community group","Team planning session","Studio rehearsal"][i%3],detail:"Synthetic fixture. Source identity is retained.",date:`2026-10-${String(2+Math.floor(i/3)).padStart(2,"0")}`,endDate:`2026-10-${String(2+Math.floor(i/3)).padStart(2,"0")}`,start:`2026-10-${String(2+Math.floor(i/3)).padStart(2,"0")}T${String(9+i%3).padStart(2,"0")}:00:00Z`,end:`2026-10-${String(2+Math.floor(i/3)).padStart(2,"0")}T${String(10+i%3).padStart(2,"0")}:00:00Z`,timezone:"UTC",sourceTarget:"calendar"}));
 return {month:"2026-10",timezone:"UTC",today:date,sources,items,attention:Array.from({length:7},(_,i)=>({...items[0],id:`attention-${i}`,state:"attention",title:`Review synthetic request ${i+1}`})),warnings:[]};
}
export function socialFixture(): SocialData {
 return {calendarId,month:"2026-10",timezone:"UTC",role:"owner",canCreate:true,canRespond:true,canOrganise:true,membersCanCreate:false,availability:[],updates:[],events:Array.from({length:8},(_,i)=>({id:`20000000-0000-4000-8000-${String(i+1).padStart(12,"0")}`,title:["Morning walk and community catch-up with neighbours","Planning lunch","Garden catch-up","Book club","Evening tennis","Birthday dinner","Volunteer briefing","Weekend plans"][i],location:i%2?"Community room":"Riverside park",notes:"Synthetic details. ".repeat(40),start:`${date}T${String(9+i).padStart(2,"0")}:00:00Z`,end:`${date}T${String(10+i).padStart(2,"0")}:00:00Z`,capacity:8,cancelled:false,version:1,own:true,canEdit:true,going:i+1,maybe:1,declined:0,myResponse:i%2?"going":null,attendees:[]}))};
}
