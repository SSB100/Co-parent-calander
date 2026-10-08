import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';

// No live transport or records: real React components, real CSS, fabricated GETs.
// Every unexpected request and every mutation fails the run.
const root = process.cwd();
const tooling = createRequire(path.resolve(process.env.COVIE_BROWSER_TOOLING ?? root, 'package.json'));
const playwrightTooling = createRequire(path.resolve(process.env.COVIE_PLAYWRIGHT_TOOLING ?? process.env.COVIE_BROWSER_TOOLING ?? root, 'package.json'));
const { build } = tooling('esbuild');
const postcss = tooling('postcss');
const tailwind = tooling('@tailwindcss/postcss');
let chromium;
try { ({ chromium } = playwrightTooling('playwright')); } catch { ({ chromium } = playwrightTooling('playwright-core')); }
const out = path.resolve(process.env.COVIE_BROWSER_OUTPUT ?? 'test-results/owner-readiness');
await fs.mkdir(out, { recursive: true });
await build({ entryPoints: ['tests/browser/owner-readiness/fixture.tsx'], bundle: true, outdir: out, jsx: 'automatic', nodePaths: [path.resolve(process.env.COVIE_BROWSER_TOOLING ?? root, 'node_modules')], loader: { '.module.css': 'local-css' }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'synthetic-boundaries', setup(b) {
  b.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'fixture' }));
  b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'fixture' }));
  b.onResolve({ filter: /\/app\/calendar\/actions$/ }, () => ({ path: 'actions', namespace: 'fixture' }));
  b.onResolve({ filter: /\/lib\/auth\/client$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ loader: 'jsx', resolveDir: root, contents: {
    link: `import React from 'react'; export default function Link({prefetch,children,...props}) { return <a {...props}>{children}</a>; }`,
    navigation: `export function useRouter() { return {push(url){window.__fixtureNavigations.push(url)},refresh(){},replace(url){window.__fixtureNavigations.push(url)}}; }`,
    actions: `const denied = async () => {window.__fixtureMutations.push('server action'); throw new Error('Synthetic fixture forbids server actions');}; export const createCalendar=denied,joinCalendar=denied,openCalendar=denied,archiveCalendar=denied,deleteCalendar=denied,restoreCalendar=denied;`,
    auth: `export const authClient = { signOut: async () => {window.__fixtureMutations.push('sign out'); throw new Error('Synthetic fixture forbids sign out');} };`,
  }[name] }));
} }] });
let globalCss = await fs.readFile('app/globals.css', 'utf8');
if (process.env.COVIE_BROWSER_TOOLING) {
  globalCss = globalCss.replace('@import \"tailwindcss\";', `@import \"${tooling.resolve('tailwindcss/index.css')}\";`).replace('@import \"@neondatabase/auth-ui/tailwind\";', `@import \"${tooling.resolve('@neondatabase/auth-ui/tailwind')}\";`);
}
const css = await postcss([tailwind({base:root})]).process(globalCss, { from: path.resolve('app/globals.css') });
await fs.writeFile(path.join(out, 'global.css'), css.css);
await fs.writeFile(path.join(out, 'index.html'), '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/global.css"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script>window.__fixtureMutations=[];window.__fixtureNavigations=[];</script><script src="/fixture.js"></script></body></html>');
if(process.env.COVIE_BROWSER_BUILD_ONLY==='1') { console.log(`Synthetic component/CSS bundle built: ${out}`); process.exit(0); }
const serverRequests = [];
const server = http.createServer(async (req, res) => {
  const target = new URL(req.url, 'http://localhost');
  const pathname = target.pathname;
  if(pathname.startsWith('/api/')) {
    serverRequests.push({url:req.url,method:req.method}); await fs.writeFile(path.join(out,'serve-transport.json'),JSON.stringify(serverRequests,null,2));
    if(req.method!=='GET') {res.statusCode=405;res.end('Synthetic fixture forbids mutations');return;}
    const reference = new URL(req.headers.referer ?? 'http://localhost/');
    const variant = reference.searchParams.get('fixture');
    const body = pathname==='/api/salon' ? salon(reference.searchParams.has('enabled')) : pathname==='/api/social-groups' ? social() : pathname==='/api/shared-facilities' ? facilities() : pathname==='/api/staff-roster/team' ? staff() : pathname==='/api/staff-roster/setup' ? {canManageSetup:true,currentAccessRole:'owner',roleCount:1,locationCount:1,memberCount:3,setupCompletedAt:null} : pathname==='/api/template-members' ? {calendarId,calendarType:variant==='social'?'social_groups':'shared_facilities',access:{role:'owner',resourceIds:[]},canInvite:true,members:[],invites:[],resources:[]} : null;
    res.setHeader('Content-Type','application/json');res.statusCode=body?200:404;res.end(JSON.stringify(body??{error:'Unexpected synthetic API'}));return;
  }
  if(pathname==='/frame') {
    const width=Number(target.searchParams.get('width'))||1440,height=Number(target.searchParams.get('height'))||900;
    target.searchParams.delete('width');target.searchParams.delete('height');
    res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><body style="margin:0;background:#ddd"><iframe title="Synthetic owner readiness fixture" src="/?${target.searchParams}" style="display:block;border:0;width:${width}px;height:${height}px"></iframe></body></html>`);return;
  }
  const name = ['fixture.js','fixture.css','global.css'].includes(pathname.slice(1)) ? pathname.slice(1) : 'index.html';
  if (/^\/brand\/[^/]+\.svg$/.test(pathname)) { try { res.setHeader('Content-Type','image/svg+xml'); res.end(await fs.readFile(path.join(root,'public',pathname))); return; } catch { res.statusCode=404; res.end('Fixture asset missing'); return; } }
  res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(await fs.readFile(path.join(out,name)));
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
const calendarId = '10000000-0000-4000-8000-000000000001';
const practitionerId = '20000000-0000-4000-8000-000000000001';
const serviceId = '30000000-0000-4000-8000-000000000001';
const date = '2026-10-09';
const privateTokens = ['DO_NOT_SHOW_CLIENT', 'do-not-show-contact@example.invalid', 'DO_NOT_SHOW_PHONE', 'DO_NOT_SHOW_NOTE', 'DO_NOT_SHOW_BLOCK'];
const settings = { businessName: 'Synthetic salon saved name', description: 'Saved public description', location: 'Saved public location', publicEnabled: false, cancellationHours: 24, leadMinutes: 0, advanceDays: 90, slotMinutes: 15 };
function salon(enabled) {
  return { calendarId, date, timezone:'UTC', role:'owner', ownPractitionerId:practitionerId, canOrganise:true, canPublish:true, settings:{...settings, publicEnabled:enabled},
    practitioners:Array.from({length:4},(_,index)=>({id:index?`20000000-0000-4000-8000-00000000000${index+1}`:practitionerId,displayName:index?'Synthetic practitioner with a longer name '+index:'Synthetic practitioner',bio:'Saved public bio',role:index?'practitioner':'owner',kind:'staff',active:true,bookable:true,own:index===0,serviceIds:[serviceId]})),
    services:[{id:serviceId,name:'Synthetic saved service',description:'Saved service description',durationMinutes:30,bufferBeforeMinutes:10,bufferAfterMinutes:10,priceMinor:5000,currency:'NZD',active:true,bookable:true}],
    hours:[{id:'synthetic-hours',practitionerId,weekday:5,startMinute:480,endMinute:1080}],
    appointments:[{id:'40000000-0000-4000-8000-000000000001',practitionerId,practitionerName:'Synthetic practitioner',serviceId,serviceName:'Synthetic saved service',durationMinutes:30,bufferBeforeMinutes:10,bufferAfterMinutes:10,priceMinor:5000,currency:'NZD',cancellationHours:24,start:`${date}T09:00:00Z`,end:`${date}T09:30:00Z`,busyStart:`${date}T08:50:00Z`,busyEnd:`${date}T09:40:00Z`,status:'confirmed',version:1,clientName:privateTokens[0],clientEmail:privateTokens[1],clientPhone:privateTokens[2],notes:privateTokens[3],ownClient:false,ownPractitioner:true,canManage:true,canCancel:true,canReschedule:true}],
    appointmentsTruncated:false,updates:[],invitations:[],timeBlocks:[{id:'50000000-0000-4000-8000-000000000001',practitionerId,start:`${date}T12:00:00Z`,end:`${date}T13:00:00Z`,reason:privateTokens[4],active:true}] };
}
function social() { return {calendarId,month:'2026-10',timezone:'UTC',role:'owner',canCreate:true,canRespond:true,canOrganise:true,membersCanCreate:false,availability:[],updates:[],events:[{id:'20000000-0000-4000-8000-000000000001',title:'Synthetic outing with a longer title',location:'Synthetic community hall',notes:'',start:`${date}T09:00:00Z`,end:`${date}T10:00:00Z`,capacity:4,cancelled:false,version:1,own:true,canEdit:true,going:1,maybe:0,declined:0,myResponse:'going',attendees:[]}]}; }
function facilities() { return {calendarId,date,timezone:'UTC',owner:true,role:'owner',canBook:true,managedResourceIds:[],rules:{openMinute:480,closeMinute:1320,openDays:[0,1,2,3,4,5,6],minDuration:30,maxDuration:240,minNoticeHours:0,advanceDays:90,cancellationHours:0,maxActiveBookings:10,requireApproval:false,shareTitles:false},updates:[],resources:Array.from({length:4},(_,index)=>({id:`20000000-0000-4000-8000-00000000000${index+1}`,name:`Synthetic resource with longer name ${index+1}`,description:'',location:'',capacity:4,active:true})),bookings:[{id:'30000000-0000-4000-8000-000000000001',resourceId:practitionerId,title:'Synthetic booking',notes:'Fixture only',start:`${date}T09:07:00Z`,end:`${date}T10:07:00Z`,status:'confirmed',own:true,canManage:true,version:1}]}; }
function staff() {
  const members = ['connected','connected','invite_active','not_invited'].map((accountState,index)=>({id:`70000000-0000-4000-8000-00000000000${index+1}`,displayName:index?'Synthetic staff profile '+index:'Synthetic owner',contactEmail:null,contactPhone:null,expectedWeeklyMinutes:null,assignedThisWeekMinutes:0,accessRole:index?'staff':'owner',active:true,roleIds:[],roleNames:[],defaultRoleId:null,defaultRoleName:null,defaultLocationId:null,defaultLocationName:null,hasAccount:accountState==='connected',accountState,hadInvite:accountState==='invite_active',inviteExpiresAt:accountState==='invite_active'?'2099-10-01T12:00:00Z':null,isCurrentUser:index===0}));
  return {currentMemberId:members[0].id,currentAccessRole:'owner',canManageTeam:true,canManageManagers:true,members,roles:[],locations:[]};
}
const viewports = [[1440,900],[1100,560],[1440,480],[1024,480],[390,844],[320,568]];
const results = [];
async function geometry(page) { return page.evaluate(() => ({body:document.body.scrollWidth,document:document.documentElement.scrollWidth,viewport:innerWidth})); }
async function noOverflow(page) { const dimensions=await geometry(page); assert(dimensions.body<=dimensions.viewport+1 && dimensions.document<=dimensions.viewport+1,`Horizontal body overflow: ${JSON.stringify(dimensions)}`); return dimensions; }
async function screenshot(page,name) { await page.screenshot({path:path.join(out,`${name}.png`),fullPage:false}); }
async function newFixture(variant,width,height,enabled=false) {
  const page = await browser.newPage({viewport:{width,height}}); const requests=[]; const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(() => { window.__fixtureMutations=[]; window.__fixtureNavigations=[]; window.__fixtureClipboard=[]; Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.__fixtureClipboard.push(text)},configurable:true}); });
  await page.route('**/*',async route=> {
    const request=route.request(); const target=new URL(request.url());
    if(target.origin!==base) { errors.push(`Unexpected external request: ${request.url()}`); return route.abort(); }
    if(!target.pathname.startsWith('/api/')) return route.continue();
    requests.push({url:target.pathname+target.search,method:request.method()});
    if(request.method()!=='GET') { errors.push(`Unexpected mutation: ${request.method()} ${target.pathname}`); return route.fulfill({status:405,body:'Synthetic test forbids mutations'}); }
    let body;
    if(target.pathname==='/api/salon') body=salon(enabled);
    else if(target.pathname==='/api/social-groups') body=social();
    else if(target.pathname==='/api/shared-facilities') body=facilities();
    else if(target.pathname==='/api/staff-roster/team') body=staff();
    else if(target.pathname==='/api/staff-roster/setup') body={canManageSetup:true,currentAccessRole:'owner',roleCount:1,locationCount:1,memberCount:3,setupCompletedAt:null};
    else if(target.pathname==='/api/template-members') body={calendarId,calendarType:variant==='social'?'social_groups':'shared_facilities',access:{role:'owner',resourceIds:[]},canInvite:true,members:[],invites:[],resources:[]};
    else { errors.push(`Unexpected API read: ${target.pathname}`); return route.fulfill({status:404,body:'Synthetic endpoint not permitted'}); }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(`${base}/?fixture=${variant}&date=${date}${enabled?'&enabled=1':''}`);
  return {page,requests,errors};
}
if(process.env.COVIE_BROWSER_SERVE_ONLY==='1') { console.log(`Synthetic fixture server: ${base}`); await new Promise(()=>{}); }
try {
  browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
  for(const variant of ['salon','social','facilities']) for(const [width,height] of viewports) {
    const {page,requests,errors}=await newFixture(variant,width,height);
    const title={salon:'Salon setup',social:'Group setup',facilities:'Facilities setup'}[variant];
    const readiness=page.getByRole('region',{name:title,exact:true}); await readiness.waitFor();
    const calendar=page.locator(variant==='salon'?'[data-salon-owner-schedule]':variant==='social'?'[aria-label="Choose a calendar day"]':'[aria-label="Resource day schedule"]');
    await calendar.waitFor(); const before=await calendar.boundingBox();
    await screenshot(page,`${variant}-collapsed-${width}x${height}`);
    assert.equal(await readiness.locator('xpath=ancestor::aside[@aria-label="Selected day workspace"]').count(),1,'Checklist must stay inside owner sidebar');
    await readiness.locator('summary').click(); assert.equal(await readiness.locator('details').getAttribute('open'),'');
    const after=await calendar.boundingBox(); assert(Math.abs(before.height-after.height)<2,`Checklist changes calendar height: ${before.height} to ${after.height}`);
    assert(Math.abs(before.width-after.width)<2,`Checklist changes calendar width: ${before.width} to ${after.width}`);
    if(width>=1100&&height>=560) { assert(after.height>=280,'Desktop calendar is crushed'); await page.evaluate(()=>window.scrollTo(0,0)); }
    const dimensions=await noOverflow(page); await screenshot(page,`${variant}-expanded-${width}x${height}`);
    if(width>=1100&&height>=560) { const sidebar=page.getByRole('complementary',{name:'Selected day workspace'}); const scroll=await sidebar.evaluate(node=>({client:node.clientHeight,scroll:node.scrollHeight,overflow:getComputedStyle(node).overflowY})); assert(['auto','scroll'].includes(scroll.overflow)); }
    if(variant!=='salon') {
      const action=variant==='social'?'Review group settings':'Review booking rules';
      await readiness.getByRole('button',{name:action,exact:true}).click(); await page.getByRole('dialog').waitFor();
      await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({state:'detached'});
      await readiness.getByRole('button',{name:action,exact:true}).click(); await page.getByRole('dialog').waitFor();
      await page.goBack(); await page.getByRole('dialog').waitFor({state:'detached'});
      await page.goForward(); await page.getByRole('dialog').waitFor();
      await page.getByRole('button',{name:'Back to calendar',exact:true}).click(); await page.getByRole('dialog').waitFor({state:'detached'});
      await noOverflow(page);
    }
    assert.deepEqual(errors,[]); assert.deepEqual(await page.evaluate(()=>window.__fixtureMutations),[]);
    results.push({variant,width,height,status:'passed',calendarBefore:before,calendarAfter:after,dimensions,requests,checks:['real shell and CSS','expanded checklist in sidebar','calendar geometry unchanged','body overflow','organiser Escape/Back/Forward/no mutations']});
    await page.close();
  }
  for(const enabled of [false,true]) for(const [width,height] of viewports) {
    const {page,requests,errors}=await newFixture('salon',width,height,enabled);
    await page.getByRole('region',{name:'Salon setup',exact:true}).waitFor();
    await page.getByRole('button',{name:'Booking settings',exact:true}).click();
    const parent=page.getByRole('dialog',{name:'Booking settings',exact:true}); await parent.waitFor();
    const sharing=parent.getByRole('region',{name:'Client booking page sharing'}); await sharing.waitFor();
    assert.equal(await sharing.getByRole('button',{name:'Copy booking link',exact:true}).count(),enabled?1:0);
    assert.equal(await sharing.getByRole('link',{name:'Open client page',exact:true}).count(),enabled?1:0);
    if(enabled) { await sharing.getByRole('button',{name:'Copy booking link',exact:true}).click(); assert.deepEqual(await page.evaluate(()=>window.__fixtureClipboard),[`${base}/booking/${calendarId}`]); }
    // Unsaved form text must not leak into the saved-display preview.
    const businessName=parent.getByLabel('Business name on booking page',{exact:true}); await businessName.fill('UNSAVED_DISPLAY_NAME');
    const countBefore=requests.length;
    await sharing.getByRole('button',{name:'Preview saved booking details',exact:true}).click();
    const preview=page.getByRole('dialog',{name:'Saved booking details preview',exact:true}); await preview.waitFor();
    const text=await preview.innerText(); assert.match(text,/Synthetic salon saved name/); assert.doesNotMatch(text,/UNSAVED_DISPLAY_NAME/);
    for(const token of privateTokens) assert(!text.includes(token),`Private token leaked in saved display: ${token}`);
    assert.match(text,/Synthetic saved service/); assert.match(text,/Synthetic practitioner/);
    assert.equal(requests.length,countBefore,'Local preview made an API request');
    await noOverflow(page); await screenshot(page,`salon-preview-${enabled?'enabled':'private'}-${width}x${height}`);
    const bounds=await preview.boundingBox(); assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=height+1,`Preview out of viewport ${JSON.stringify(bounds)}`);
    await page.keyboard.press('Escape'); await preview.waitFor({state:'detached'}); await parent.waitFor();
    await sharing.getByRole('button',{name:'Preview saved booking details',exact:true}).click(); await preview.waitFor();
    await preview.getByRole('button',{name:'Close preview',exact:true}).click(); await preview.waitFor({state:'detached'}); await parent.waitFor();
    await sharing.getByRole('button',{name:'Preview saved booking details',exact:true}).click(); await preview.waitFor();
    await page.goBack(); await page.getByRole('dialog').waitFor({state:'detached'});
    await page.goForward(); await parent.waitFor(); assert.equal(await preview.count(),0,'Back/Forward resurrected a nested preview');
    await sharing.getByRole('button',{name:'Preview saved booking details',exact:true}).click(); await preview.waitFor();
    await page.keyboard.press('Escape'); await preview.waitFor({state:'detached'});
    await page.keyboard.press('Escape'); await parent.waitFor({state:'detached'});
    await page.getByRole('button',{name:'Booking settings',exact:true}).click(); await parent.waitFor(); assert.equal(await preview.count(),0);
    assert.equal(requests.some(request=>/public|\/booking\//.test(request.url)),false); assert(requests.every(request=>request.method==='GET'));
    assert.deepEqual(errors,[]); assert.deepEqual(await page.evaluate(()=>window.__fixtureMutations),[]);
    results.push({variant:'salon-sharing',enabled,width,height,status:'passed',requests,checks:['enabled-only link/copy','saved not draft display','no client/contact/private records','local preview no API','nested Escape','close/reopen','Back/Forward drops preview','no public API or mutations','dialog viewport fit']}); await page.close();
  }
  for(const [width,height] of viewports) {
    const {page,requests,errors}=await newFixture('staff',width,height);
    const readiness=page.getByRole('region',{name:'Roster setup and account access',exact:true});await readiness.waitFor();
    const labels=['Roster profiles','Accounts linked','Awaiting acceptance','Profile only'];
    for(const [index,label] of labels.entries()) {const metric=readiness.locator('dl div').filter({has:page.getByText(label,{exact:true})});assert.equal(await metric.locator('dd').innerText(),index===0?'3':'1');}
    assert.match(await readiness.innerText(),/An invitation is not account access until it is accepted/);
    assert.match(await readiness.innerText(),/Locations and leave are optional/);
    assert.equal(await readiness.getByRole('link',{name:'Open roster',exact:true}).getAttribute('href'),'/calendar-types/staff-rosters');
    const dimensions=await noOverflow(page);await screenshot(page,`staff-readiness-${width}x${height}`);
    assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.__fixtureMutations),[]);
    results.push({variant:'staff',width,height,status:'passed',dimensions,requests,checks:['roster profiles and account access distinct','pending invitation not joined','optional locations/leave','no horizontal overflow','no mutations']});await page.close();
  }
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify({status:'passed',cases:results.length,output:out,results},null,2));
} catch(error) {
  for(const page of browser?.contexts().flatMap(context=>context.pages()) ?? []) { await screenshot(page,'failure').catch(()=>{}); await fs.writeFile(path.join(out,'failure.html'),await page.content()).catch(()=>{}); }
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify({status:'failed',error:String(error),completed:results},null,2)); throw error;
} finally { await browser?.close(); await new Promise(resolve=>server.close(resolve)); }
