import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { chromium } from 'playwright';

// Actual UI and CSS; only transport/server-action boundaries are synthetic.
// No authentication, calendar records or production endpoints are used.
const out = path.resolve('test-results/my-calendars');
await fs.mkdir(out, { recursive: true });
await build({ entryPoints: ['tests/browser/my-calendars/fixture.tsx'], bundle: true, outdir: out, jsx: 'automatic', loader: { '.module.css': 'local-css' }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'synthetic-boundaries', setup(b) {
  b.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'fixture' }));
  b.onResolve({ filter: /\/app\/(calendar|personal)\/actions$/ }, () => ({ path: 'actions', namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ loader: 'jsx', resolveDir: process.cwd(), contents: name === 'link' ? `import React from 'react'; export default function Link({prefetch,children,...props}) { return <a {...props}>{children}</a>; }` : `export async function openPersonalSource() {} export async function openCalendar(form) { const id=form.get('calendarId'); window.__openedCalendar=id; history.pushState({},'', '/selected/'+id); dispatchEvent(new PopStateEvent('popstate')); }` }));
} }] });
const css = await postcss([tailwind()]).process(await fs.readFile('app/globals.css', 'utf8'), { from: path.resolve('app/globals.css') });
await fs.writeFile(path.join(out, 'global.css'), css.css);
await fs.writeFile(path.join(out, 'index.html'), '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/global.css"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
const server = http.createServer(async (req, res) => { const file = ['fixture.js','fixture.css','global.css'].includes(req.url.slice(1)) ? req.url.slice(1) : 'index.html'; res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); res.end(await fs.readFile(path.join(out,file))); });
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const results = [];
const calendars = [ {id:'calendar-1',name:'Community courts',calendarType:'shared_facilities'}, {id:'calendar-2',name:'Friends and family plans',calendarType:'social_groups'}, {id:'calendar-3',name:'Our shared family schedule',calendarType:'co_parenting'}, {id:'calendar-4',name:'The neighbourhood salon with a deliberately long calendar name',calendarType:'salon_bookings'}, ...Array.from({length:12},(_,i)=>({id:`calendar-${i+5}`,name:`Team calendar ${i+1}`,calendarType:'staff_rosters'})) ];
try {
  for (const [width,height] of [[1440,900],[1100,560],[1024,480],[390,844],[320,568]]) {
    const page = await browser.newPage({ viewport: {width,height} });
    const errors=[]; page.on('pageerror', e=>errors.push(e.message));
    let mode='success';
    await page.route('**/api/calendars/navigation', async route=> {
      if(mode==='slow') { await new Promise(r=>setTimeout(r,500)); }
      await route.fulfill({status:mode==='error'?500:200,contentType:'application/json',body:JSON.stringify({calendars:mode==='empty'?[]:calendars})}).catch(()=>{});
    });
    await page.goto(url);
    const trigger = page.getByRole('button',{name:'My calendars',exact:true}).filter({visible:true});
    await trigger.click();
    const dialog=page.getByRole('dialog',{name:'My calendars',exact:true});
    await dialog.getByRole('button',{name:'Community courts',exact:false}).waitFor();
    assert.equal(await dialog.getAttribute('aria-modal'),width<1024?'true':null);
    const bounds=await dialog.boundingBox(); assert(bounds.x>=0 && bounds.y>=0 && bounds.x+bounds.width<=width+1 && bounds.y+bounds.height<=height+1, JSON.stringify(bounds));
    const active=dialog.locator('[aria-current="page"]'); assert.match(await active.innerText(),/Personal/);
    const smallest=await dialog.locator('button').evaluateAll(nodes=>Math.min(...nodes.map(n=>n.getBoundingClientRect().height))); assert(smallest>=44);
    await page.screenshot({path:path.join(out,`${width}x${height}.png`),fullPage:false});
    // Small synthetic-only image previews in logs let reviewers inspect pixels
    // through read-only CI tools; full PNGs remain in the artifact.
    if (process.env.CI && (width===1440 || width===390)) {
      const preview=(await page.screenshot({type:'jpeg',quality:55})).toString('base64');
      for(let offset=0;offset<preview.length;offset+=6000) console.log(`COVIE_IMAGE ${width}x${height} ${offset} ${preview.slice(offset,offset+6000)}`);
    }
    if(width>=1024) { const anchor=await trigger.boundingBox(); assert(Math.abs(bounds.x-anchor.x)<2); await trigger.click(); assert.equal(await dialog.count(),0); await trigger.click(); }
    await page.keyboard.press('Escape'); await dialog.waitFor({state:'detached'}); assert(await trigger.evaluate(n=>document.activeElement===n));
    await trigger.focus(); await page.keyboard.press('Enter'); await dialog.waitFor();
    if(width<1024) { for(let i=0;i<25;i++) { await page.keyboard.press('Tab'); assert(await dialog.evaluate(n=>n.contains(document.activeElement))); } await dialog.getByRole('button',{name:'Close dialog',exact:true}).click(); }
    else { await page.mouse.click(width-8,8); }
    await dialog.waitFor({state:'detached'});
    mode='empty'; await trigger.click(); await dialog.getByText(/don’t have any active/).waitFor(); await page.keyboard.press('Escape');
    mode='error'; await trigger.click(); await dialog.getByRole('alert').waitFor(); mode='success'; await dialog.getByRole('button',{name:'Try again',exact:true}).click(); await dialog.getByRole('button',{name:'Community courts',exact:false}).waitFor();
    await dialog.getByRole('button',{name:'Community courts',exact:false}).click(); await dialog.waitFor({state:'detached'}); assert.equal(await page.evaluate(()=>window.__openedCalendar),'calendar-1'); assert.match(page.url(),/selected\/calendar-1$/);
    await page.goBack(); await page.waitForURL(url+'/'); assert.equal(await dialog.count(),0);
    await trigger.click(); await dialog.waitFor(); await page.reload(); assert.equal(await dialog.count(),0);
    await trigger.click(); await dialog.waitFor(); await page.setViewportSize({width:width<1024?1200:390,height:height}); await dialog.waitFor({state:'detached'});
    await page.setViewportSize({width,height});
    await trigger.click(); await dialog.waitFor(); await page.evaluate(()=>dispatchEvent(new Event('blur'))); await dialog.waitFor({state:'detached'});
    mode='slow'; await trigger.click(); await dialog.getByRole('status').waitFor(); await page.keyboard.press('Escape'); await page.waitForTimeout(600); assert.equal(await dialog.count(),0);
    assert.deepEqual(errors,[]); results.push({width,height,status:'passed',checks:['geometry','44px targets','Personal current','Escape/focus','repeat/outside or modal trap','empty/error/retry','select existing action','Back/reload','resize','blur','slow dismissal']});
    await page.close();
  }
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
} finally { await browser.close(); server.close(); }
