import { z } from "zod";
export const socialSettingsSchema=z.object({membersCanCreate:z.boolean()});
export const socialEventSchema=z.object({
 id:z.string().uuid().optional(),version:z.number().int().min(1).optional(),requestId:z.string().uuid().optional(),
 title:z.string().trim().min(1,"Add an event title.").max(120),location:z.string().trim().max(200).default(""),notes:z.string().trim().max(3000).default(""),
 start:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),end:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),capacity:z.number().int().min(1).max(10000).nullable().default(null),
}).refine(v=>v.id?!!v.version:!!v.requestId,{message:"Reopen the event form and try again."});
export const socialRsvpSchema=z.object({eventId:z.string().uuid(),response:z.enum(["going","maybe","declined"])});
export const socialCancelSchema=z.object({id:z.string().uuid(),version:z.number().int().min(1)});
export const socialAvailabilitySchema=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),status:z.enum(["available","unavailable"]),note:z.string().trim().max(300).default("")});
export type SocialEvent={id:string;title:string;location:string;notes:string;start:string;end:string;capacity:number|null;cancelled:boolean;version:number;own:boolean;canEdit:boolean;going:number;maybe:number;declined:number;myResponse:"going"|"maybe"|"declined"|null;attendees:{name:string;response:string}[]};
export type SocialAvailability={id:string;date:string;status:"available"|"unavailable";note:string;name:string;own:boolean};
export type SocialData={calendarId:string;role:"owner"|"admin"|"member"|"viewer";canCreate:boolean;canRespond:boolean;canOrganise:boolean;membersCanCreate:boolean;timezone:string;month:string;events:SocialEvent[];availability:SocialAvailability[];updates:{id:string;action:string;eventTitle:string;createdAt:string}[]};
