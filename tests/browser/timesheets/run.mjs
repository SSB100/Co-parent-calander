import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";

const root = process.cwd();
const tooling = createRequire(path.resolve(process.env.COVIE_BROWSER_TOOLING ?? root, "package.json"));
const playwrightTooling = createRequire(path.resolve(process.env.COVIE_PLAYWRIGHT_TOOLING ?? process.env.COVIE_BROWSER_TOOLING ?? root, "package.json"));
const { build } = tooling("esbuild");
const postcss = tooling("postcss");
const tailwind = tooling("@tailwindcss/postcss");
const out = path.resolve(process.env.COVIE_BROWSER_OUTPUT ?? "test-results/timesheets");
await fs.mkdir(out, { recursive: true });
await build({ entryPoints: ["tests/browser/timesheets/fixture.tsx"], bundle: true, outdir: out, jsx: "automatic", nodePaths: [path.resolve(process.env.COVIE_BROWSER_TOOLING ?? root, "node_modules")], loader: { ".module.css": "local-css" }, define: { "process.env.NODE_ENV": '"production"' }, plugins: [{ name: "synthetic-boundaries", setup(b) {
  b.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "fixture" }));
  b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "fixture" }));
  b.onResolve({ filter: /\/app\/calendar\/actions$/ }, () => ({ path: "actions", namespace: "fixture" }));
  b.onResolve({ filter: /\/lib\/auth\/client$/ }, () => ({ path: "auth", namespace: "fixture" }));
  b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path: name }) => ({ loader: "jsx", resolveDir: root, contents: {
    link: "import React from 'react'; export default function Link({prefetch,children,...props}) { return <a {...props}>{children}</a>; }",
    navigation: "export function useRouter() { return {push(url){window.__fixtureNavigations.push(url)},refresh(){},replace(url){window.__fixtureNavigations.push(url)}}; }",
    actions: "const denied = async () => {window.__fixtureMutations.push('server action'); throw new Error('Synthetic fixture forbids server actions');}; export const createCalendar=denied,joinCalendar=denied,openCalendar=denied,archiveCalendar=denied,deleteCalendar=denied,restoreCalendar=denied;",
    auth: "export const authClient = { signOut: async () => {window.__fixtureMutations.push('sign out'); throw new Error('Synthetic fixture forbids sign out');} };",
  }[name] }));
} }] });
let globalCss = await fs.readFile("app/globals.css", "utf8");
if (process.env.COVIE_BROWSER_TOOLING) globalCss = globalCss.replace('@import "tailwindcss";', `@import "${tooling.resolve("tailwindcss/index.css")}";`).replace('@import "@neondatabase/auth-ui/tailwind";', `@import "${tooling.resolve("@neondatabase/auth-ui/tailwind")}";`);
const css = await postcss([tailwind({ base: root })]).process(globalCss, { from: path.resolve("app/globals.css") });
await fs.writeFile(path.join(out, "global.css"), css.css);
await fs.writeFile(path.join(out, "index.html"), '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/global.css"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script>window.__fixtureMutations=[];window.__fixtureNavigations=[];</script><script src="/fixture.js"></script></body></html>');
if (process.env.COVIE_BROWSER_BUILD_ONLY === "1") { console.log(`Synthetic Timesheets bundle built: ${out}`); process.exit(0); }

const serverRequests = [];
const serveOnly = process.env.COVIE_BROWSER_SERVE_ONLY === "1";
const server = http.createServer(async (req, res) => {
  const target = new URL(req.url, "http://localhost");
  if (target.pathname.startsWith("/api/")) {
    const reference = new URL(req.headers.referer ?? "http://localhost/");
    const variant = reference.searchParams.get("fixture") ?? "staff-calendar";
    const identityMatches = req.headers["x-covie-calendar-id"] === calendarId;
    const allowedQuery = [...target.searchParams.keys()].every(key => ["date", "view", "entryId"].includes(key));
    const record = { url: req.url, method: req.method, calendarId: req.headers["x-covie-calendar-id"] ?? null, variant, allowed: serveOnly && req.method === "GET" && target.pathname === "/api/timesheets" && identityMatches && allowedQuery && variants.includes(variant) };
    serverRequests.push(record);
    await fs.writeFile(path.join(out, "serve-transport.json"), JSON.stringify(serverRequests, null, 2));
    res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store");
    if (!record.allowed) { res.statusCode = 405; res.end(JSON.stringify({ error: "Unexpected fixture transport. No real API is available." })); return; }
    if (reference.searchParams.has("stale")) { res.statusCode = 409; res.end(JSON.stringify({ error: "Your selected calendar changed. Reload this page." })); return; }
    const body = snapshot(variant, target.searchParams);
    if (target.searchParams.has("entryId")) {
      const entry = body.entries.find(entry => entry.id === target.searchParams.get("entryId"));
      if (!entry) { res.statusCode = 404; res.end(JSON.stringify({ error: "Work block unavailable in this synthetic scope." })); return; }
      res.end(JSON.stringify({ calendarId, history: [{ id: "synthetic-change", action: "update", reason: "Corrected the work notes", actorName: "Morgan Chen", createdAt: `${date}T16:00:00Z`, ownActor: true, before: { ...entry, notes: "Earlier draft work notes" }, after: entry }] })); return;
    }
    res.end(JSON.stringify(body)); return;
  }
  if (target.pathname === "/frame") {
    const width = Math.min(3000, Math.max(240, Number(target.searchParams.get("width")) || 1440));
    const height = Math.min(3000, Math.max(240, Number(target.searchParams.get("height")) || 900));
    target.searchParams.delete("width"); target.searchParams.delete("height");
    res.setHeader("Content-Type", "text/html"); res.end(`<!doctype html><html><body style="margin:0;background:#ddd"><iframe title="Synthetic Timesheets fixture" src="/?${target.searchParams}" style="display:block;border:0;width:${width}px;height:${height}px"></iframe></body></html>`); return;
  }
  const asset = target.pathname.slice(1);
  const name = ["fixture.js", "fixture.css", "global.css"].includes(asset) ? asset : "index.html";
  if (/^\/brand\/[^/]+\.svg$/.test(target.pathname)) { try { res.setHeader("Content-Type", "image/svg+xml"); res.end(await fs.readFile(path.join(root, "public", target.pathname))); return; } catch { res.statusCode = 404; res.end("Missing fixture asset"); return; } }
  res.setHeader("Content-Type", name.endsWith(".js") ? "text/javascript" : name.endsWith(".css") ? "text/css" : "text/html");
  res.end(await fs.readFile(path.join(out, name)));
});
await new Promise(resolve => server.listen(serveOnly ? Number(process.env.COVIE_BROWSER_PORT ?? 40215) : 0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const calendarId = "10000000-0000-4000-8000-000000000001";
const self = "20000000-0000-4000-8000-000000000001", employee = "20000000-0000-4000-8000-000000000002", manager = "20000000-0000-4000-8000-000000000003";
const date = "2026-10-08";
function snapshot(variant, query) {
  const role = variant.startsWith("owner-") ? "owner" : variant.startsWith("manager-") ? "manager" : "member";
  const people = [{ id: self, displayName: "Morgan Chen", email: "morgan@example.invalid", role, active: true, own: true, linked: true, version: 1 }, { id: employee, displayName: "Taylor with a longer display name", email: "taylor@example.invalid", role: "member", active: true, own: false, linked: false, version: 1 }, { id: manager, displayName: "Jamie Patel", email: "jamie@example.invalid", role: "manager", active: true, own: false, linked: true, version: 1 }];
  const entries = [{ id: "entry-one", staffId: self, clientId: "client", projectId: "project", start: `${date}T09:00:00Z`, end: `${date}T10:30:00Z`, timezone: "UTC", notes: "Research and draft design options", billable: true, durationMinutes: 90, incrementMinutes: 15, version: 1 }, { id: "entry-two", staffId: self, clientId: null, projectId: null, start: `${date}T11:00:00Z`, end: `${date}T11:45:00Z`, timezone: "UTC", notes: "Internal team planning", billable: false, durationMinutes: 45, incrementMinutes: 15, version: 1 }, { id: "entry-team", staffId: employee, clientId: "client", projectId: "project", start: `${date}T13:00:00Z`, end: `${date}T15:00:00Z`, timezone: "UTC", notes: "Assigned team review", billable: true, durationMinutes: 120, incrementMinutes: 15, version: 1 }];
  return { calendarId, role, ownStaffId: self, date: query.get("date") || date, view: query.get("view") || "week", organisation: { id: "org", name: "Synthetic studio", timezone: "UTC", incrementMinutes: 15, version: 1 }, staff: role === "member" ? people.slice(0, 1) : role === "manager" ? people.slice(0, 2) : people, clients: [{ id: "client", name: "Harbour client", active: true, version: 1 }], projects: [{ id: "project", clientId: "client", name: "Studio launch", active: true, version: 1 }], assignments: [{ managerStaffId: role === "manager" ? self : manager, staffId: employee }], invitations: [], entries: role === "member" ? entries.slice(0, 2) : entries, totals: [{ staffId: self, totalMinutes: 135, billableMinutes: 90 }, ...(role === "member" ? [] : [{ staffId: employee, totalMinutes: 120, billableMinutes: 120 }])] };
}
async function noOverflow(page) {
  const dimensions = await page.evaluate(() => ({ body: document.body.scrollWidth, document: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert(dimensions.body <= dimensions.viewport + 1 && dimensions.document <= dimensions.viewport + 1, `Document overflow: ${JSON.stringify(dimensions)}`);
  return dimensions;
}
async function dialogFits(page) {
  const bounds = await page.getByRole("dialog").boundingBox();
  const viewport = page.viewportSize();
  assert(bounds && bounds.x >= -1 && bounds.y >= -1 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1, `Dialog outside viewport: ${JSON.stringify(bounds)}`);
}
const results = [], screenshots = [];
const variants = ["owner-settings", "owner-team", "owner-clients", "staff-calendar", "manager-calendar"];
const viewports = [[1440, 900], [390, 844], [320, 568]];
const expectedCases = variants.length * viewports.length;
let browser;
if (serveOnly) {
  console.log(`Synthetic Timesheets fixture server: ${base}`);
  console.log(`Example: ${base}/?fixture=staff-calendar`);
  console.log(`Exact viewport: ${base}/frame?fixture=owner-team&width=390&height=844`);
  await new Promise(() => {});
}
const summary = fatalError => ({ status: fatalError || results.some(result => result.status === "failed") ? "failed" : results.length === expectedCases ? "passed" : "running", expectedCases, cases: results.length, passed: results.filter(result => result.status === "passed").length, failed: results.filter(result => result.status === "failed").length, ...(fatalError ? { fatalError } : {}), screenshots, results, unmockedRequests: serverRequests });
try {
  let chromium;
  try { ({ chromium } = playwrightTooling("playwright")); } catch { ({ chromium } = playwrightTooling("playwright-core")); }
  browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ["--no-sandbox"] });
  for (const variant of variants) for (const [width, height] of viewports) {
    const caseId = `${variant}-${width}x${height}`;
    const page = await browser.newPage({ viewport: { width, height } });
    const requests = [], errors = []; let stale = false;
    page.setDefaultTimeout(8000); page.on("pageerror", error => errors.push(error.message));
    const capture = async suffix => { await noOverflow(page); const filename = `${caseId}-${suffix}.png`; await page.screenshot({ path: path.join(out, filename), fullPage: false }); screenshots.push(filename); };
    await page.route("**/*", async route => {
      const request = route.request(), target = new URL(request.url());
      if (target.origin !== base) { errors.push(`External request blocked: ${target.href}`); return route.abort(); }
      if (!target.pathname.startsWith("/api/")) return route.continue();
      requests.push({ url: target.pathname + target.search, method: request.method(), calendarId: request.headers()["x-covie-calendar-id"] });
      if (request.method() !== "GET" || target.pathname !== "/api/timesheets" || request.headers()["x-covie-calendar-id"] !== calendarId || [...target.searchParams.keys()].some(key => !["date", "view"].includes(key))) { errors.push(`Unexpected API: ${request.method()} ${target.href}`); return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ error: "Unexpected fixture transport" }) }); }
      await route.fulfill({ status: stale ? 409 : 200, contentType: "application/json", body: JSON.stringify(stale ? { error: "Your selected calendar changed." } : snapshot(variant, target.searchParams)) });
    });
    try {
      await page.goto(`${base}/?fixture=${variant}`);
      if (variant === "owner-settings") {
        await page.getByLabel("Organisation name", { exact: true }).waitFor();
        assert.deepEqual(await page.getByLabel("Time increment").locator("option").allTextContents(), ["5 minutes", "10 minutes", "15 minutes", "30 minutes", "60 minutes"]);
        assert.match(await page.locator("main").innerText(), /existing entries unchanged/);
        await page.getByLabel("Time increment").selectOption("30");
        await capture("settings");
      } else if (variant === "owner-team") {
        await page.getByRole("button", { name: "Add staff member", exact: true }).waitFor();
        assert.match(await page.locator("main").innerText(), /taylor@example.invalid/);
        assert.equal(await page.getByRole("button", { name: "Create invitation link", exact: true }).count(), 1);
        assert.equal(await page.getByLabel("Personal invitation link").count(), 0);
        await capture("team");
        await page.getByRole("button", { name: "Add staff member", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "Add staff profile", exact: true }); await dialog.waitFor();
        await dialog.getByLabel("Name", { exact: true }).fill("New synthetic staff");
        await dialog.getByLabel(/^Email/).fill("new-staff@example.invalid");
        assert.equal(await dialog.locator('input[type="password"]').count(), 0);
        await dialogFits(page); await capture("staff-editor");
        await page.keyboard.press("Escape"); await dialog.waitFor({ state: "detached" });
        await page.getByRole("button", { name: "Add staff member", exact: true }).click(); await dialog.waitFor();
        await dialog.getByRole("button", { name: "Cancel", exact: true }).click(); await dialog.waitFor({ state: "detached" });
      } else if (variant === "owner-clients") {
        await page.getByRole("button", { name: "Add project", exact: true }).waitFor();
        await capture("clients-projects");
        await page.getByRole("button", { name: "Edit Studio launch", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "Edit project", exact: true }); await dialog.waitFor();
        assert.equal(await dialog.getByLabel(/^Client/).isDisabled(), true);
        await dialogFits(page); await capture("project-editor");
        await dialog.getByRole("button", { name: "Close dialog", exact: true }).click(); await dialog.waitFor({ state: "detached" });
      } else {
        await page.getByRole("region", { name: "Week work calendar", exact: true }).waitFor();
        assert.match(await page.getByRole("region", { name: "Selected period totals", exact: true }).innerText(), /2h 15m/);
        if (variant === "manager-calendar") {
          await page.getByLabel("Show work for").selectOption("all");
          assert.match(await page.getByRole("region", { name: "Selected period totals", exact: true }).innerText(), /4h 15m/);
          assert.match(await page.locator("main").innerText(), /Assigned team review/);
          assert.doesNotMatch(await page.locator("main").innerText(), /Jamie Patel|Add staff member/);
        } else { assert.equal(await page.getByLabel("Show work for").count(), 0); }
        await capture("week");
        await page.getByRole("button", { name: "Day", exact: true }).click();
        await page.getByRole("region", { name: "Day work calendar", exact: true }).waitFor();
        await capture("day");
        await page.getByRole("button", { name: "Add work block", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "Add work block", exact: true }); await dialog.waitFor();
        await dialog.getByLabel("End", { exact: true }).fill("2026-10-08T10:07");
        assert.equal(await dialog.getByRole("button", { name: "Save work block", exact: true }).isDisabled(), true);
        await dialog.getByLabel("End", { exact: true }).fill("2026-10-08T10:15");
        await dialog.getByLabel("Work notes", { exact: true }).fill("Synthetic new work note; not saved");
        await dialog.getByLabel("Billable work", { exact: true }).check();
        await dialogFits(page); await capture("entry-editor");
        await page.keyboard.press("Escape"); await dialog.waitFor({ state: "detached" });
        await page.getByRole("button", { name: "Add work block", exact: true }).click(); await dialog.waitFor();
        assert.equal(await dialog.getByLabel("Work notes", { exact: true }).inputValue(), "");
        await dialog.getByRole("button", { name: "Cancel", exact: true }).click(); await dialog.waitFor({ state: "detached" });
        stale = true; await page.getByRole("button", { name: "Refresh timesheets", exact: true }).click();
        await page.getByRole("alert").filter({ hasText: "These timesheets are unavailable" }).waitFor();
        const content = await page.locator("main").innerText();
        assert.doesNotMatch(content, /Research and draft|Assigned team review|Internal team planning|Morgan Chen/);
        assert.equal(await page.getByRole("dialog").count(), 0); await capture("stale-calendar");
      }
      const dimensions = await noOverflow(page);
      assert.deepEqual(errors, []); assert.deepEqual(await page.evaluate(() => window.__fixtureMutations), []);
      assert(requests.length > 0 && requests.every(request => request.method === "GET"));
      results.push({ caseId, status: "passed", dimensions, requests }); console.log(`PASS ${caseId}`);
    } catch (error) {
      await capture("failure").catch(() => {});
      await fs.writeFile(path.join(out, `${caseId}-failure.html`), await page.content());
      results.push({ caseId, status: "failed", error: String(error), stack: error.stack, errors, requests }); console.error(`FAIL ${caseId}: ${String(error)}`);
    } finally { await page.close(); await fs.writeFile(path.join(out, "results.json"), JSON.stringify(summary(), null, 2)); }
  }
  assert.deepEqual(serverRequests, [], "An API call escaped the synthetic transport");
  assert.equal(results.length, expectedCases);
  if (results.some(result => result.status === "failed")) process.exitCode = 1;
  console.log(JSON.stringify(summary(), null, 2));
} catch (error) {
  await fs.writeFile(path.join(out, "results.json"), JSON.stringify(summary(String(error)), null, 2));
  console.error(String(error)); process.exitCode = 1;
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
