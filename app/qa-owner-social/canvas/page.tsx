"use client";
import React, { useEffect, useState } from 'react';
import { SocialGroupsPage } from '@/components/social-groups/social-groups-page';
import { CoviePage } from '@/components/ui/covie';
import { TemplateWorkspaceNav } from '@/components/templates/template-workspace-nav';
import { CalendarDays, Settings, UsersRound } from 'lucide-react';
import styles from '@/components/workspace/owner-calendar-workspace.module.css';
const date='2099-10-02', calendarId='10000000-0000-4000-8000-000000000001';
const tools=[{key:'members',label:'Members',description:'People in your group',icon:UsersRound},{key:'availability',label:'Availability',description:'Find a day together',icon:CalendarDays},{key:'group-settings',label:'Group settings',description:'How the group works',icon:Settings}];
export default function SocialCanvasFixture() {
const [ready,setReady]=useState(false);
useEffect(()=>{
const params=new URLSearchParams(window.location.search);
const populated=params.get('fixture')!=='empty';
const role=params.get('role')==='member'?'member':'owner';
const events=populated?Array.from({length:8},(_,i)=>({id:`20000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,title:['Morning walk','Planning lunch','Garden catch-up','Book club','Evening tennis','Birthday dinner','Volunteer briefing','Weekend plans'][i],location:i%2?'Community room':'Riverside park',notes:'Synthetic layout fixture only',start:`${date}T${String(9+i).padStart(2,'0')}:00:00Z`,end:`${date}T${String(10+i).padStart(2,'0')}:00:00Z`,capacity:i%2?null:8,cancelled:false,version:1,own:true,canEdit:true,going:i+1,maybe:1,declined:0,myResponse:i%2?'going':null,attendees:[]})):[];
const originalFetch=window.fetch;
window.fetch=async(input,init)=>{
 if(init?.method==='POST')return new Response(JSON.stringify({error:'This isolated layout fixture does not save changes.'}),{status:400});
 if(String(input).startsWith('/api/template-members'))return new Response(JSON.stringify({calendarId,calendarType:'social_groups',access:{role,resourceIds:[]},canInvite:role==='owner',members:[{id:'30000000-0000-4000-8000-000000000001',name:'Synthetic organiser',role:'owner',isCurrentUser:true,resourceIds:[]}],invites:[],resources:[]}));
 if(!String(input).startsWith('/api/social-groups'))throw new Error('Network requests are disabled in this synthetic fixture');
 const requested=new URL(String(input),window.location.origin).searchParams.get('month')||'2099-10';
 return new Response(JSON.stringify({calendarId,month:requested,timezone:'UTC',role,canCreate:true,canRespond:true,canOrganise:role==='owner',membersCanCreate:false,availability:[],updates:[],events:requested==='2099-10'?events:[]}));
};

setReady(true);return()=>{window.fetch=originalFetch;};
},[]);
if(!ready)return <p>Loading synthetic layout…</p>;
return <div onClickCapture={event=>{if(event.target instanceof HTMLElement && event.target.closest("a"))event.preventDefault();}} className="min-h-screen bg-[#FFF9F2] lg:pl-[252px]">
<TemplateWorkspaceNav basePath="/calendar-types/social-groups" organiserItems={tools} activeSection="calendar" />
<CoviePage width="wide" className={`${styles.page} pb-[calc(104px+env(safe-area-inset-bottom))] lg:pb-6`}>
 <div className={styles.calendarHeader}><details className="calendar-switcher relative z-40"><summary className="group inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-[10px] px-1 text-left text-[#243139]"><span className="block min-w-0 truncate text-2xl font-semibold tracking-tight sm:text-3xl">QA Social owner review</span><span aria-hidden="true">⌄</span></summary><p className="covie-notice">Synthetic layout fixture; no account or live data.</p></details></div>
 <section className={styles.calendarSection}><SocialGroupsPage calendarId={calendarId} section="calendar" initialDate={date}/></section>
</CoviePage></div>;
}
