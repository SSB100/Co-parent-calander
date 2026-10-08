import assert from "node:assert/strict";
import test from "node:test";
import { BRACES_ADVISORY, DEV_CHAIN, EXCEPTION_EXPIRES, auditArguments, evaluateDependencyAudit } from "../scripts/dependency-audit-policy.mjs";
import { findRestrictedReferences, isRuntimeSource } from "../scripts/dependency-audit-source.mjs";

function report(vulnerabilities = {}) {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 };
  for (const entry of Object.values(vulnerabilities)) { counts[entry.severity]++; counts.total++; }
  return { auditReportVersion: 2, vulnerabilities, metadata: { vulnerabilities: counts } };
}

function fixture() {
  const manifest = { dependencies: {}, devDependencies: { "eslint-config-next": "16.3.8" } };
  const packages = { "": structuredClone(manifest) };
  const vulnerabilities = {};
  for (const [name, expected] of Object.entries(DEV_CHAIN)) {
    packages[`node_modules/${name}`] = { version: expected.version, dev: true, dependencies: expected.via ? { [expected.via]: expected.range } : {} };
    vulnerabilities[name] = {
      name, severity: "high", nodes: [`node_modules/${name}`],
      via: [expected.via || { name: "braces", dependency: "braces", url: BRACES_ADVISORY, severity: "high", range: "<=3.0.3" }],
    };
  }
  return {
    full: report(vulnerabilities), production: report(), manifest,
    lock: { lockfileVersion: 3, packages }, now: "2026-10-08T00:00:00Z",
    resolvedConfigs: [{ file: "app/page.tsx", settings: { react: { version: "detect" } } }], runtimeImports: [],
  };
}

function rejected(mutate, pattern) {
  const input = fixture(); mutate(input);
  const decision = evaluateDependencyAudit(input);
  assert.equal(decision.ok, false);
  assert.match(decision.failures.join("\n"), pattern);
}

test("full audit explicitly includes development, optional, and peer dependencies", () => {
  assert.deepEqual(auditArguments(false), ["audit", "--package-lock-only", "--audit-level=high", "--json", "--include=dev", "--include=optional", "--include=peer"]);
});

test("production audit explicitly omits dev while overriding inherited include values", () => {
  assert.deepEqual(auditArguments(true), ["audit", "--package-lock-only", "--audit-level=high", "--json", "--omit=dev", "--include=prod", "--include=optional", "--include=peer"]);
});

for (const [kind, source, specifier] of [
  ["static import", "import braces from 'braces';", "braces"],
  ["require", "const glob = require('fast-glob');", "fast-glob"],
  ["dynamic import", "await import('micromatch');", "micromatch"],
  ["package subpath", "export { default } from 'eslint-config-next/core-web-vitals';", "eslint-config-next/core-web-vitals"],
  ["template literal", "await import(`braces/lib/parse.js`);", "braces/lib/parse.js"],
  ["lint runner", "import { ESLint } from 'eslint';", "eslint"],
]) test(`runtime scanner detects ${kind}`, () => {
  assert.deepEqual(findRestrictedReferences("lib/runtime.ts", source), [{ file: "lib/runtime.ts", specifier }]);
});

test("runtime scanner does not mistake comments or unrelated package names for imports", () => {
  assert.deepEqual(findRestrictedReferences("lib/runtime.ts", "// import braces from 'braces';\nimport React from 'react'; const text = 'braces-example';"), []);
});

test("only tests, exact audit scripts, and ESLint configuration are excluded from runtime scanning", () => {
  for (const file of ["tests/dependency-audit.test.mjs", "scripts/dependency-audit.mjs", "scripts/dependency-audit-policy.mjs", "scripts/dependency-audit-source.mjs", "eslint.config.mjs"]) assert.equal(isRuntimeSource(file), false, file);
  for (const file of ["app/page.tsx", "lib/helper.ts", "scripts/image-worker.mjs", "scripts/dependency-audit-extra.mjs"]) assert.equal(isRuntimeSource(file), true, file);
});

test("only the reviewed development advisory chain can use the temporary exception", () => {
  const input = fixture(); const before = structuredClone(input);
  const decision = evaluateDependencyAudit(input);
  assert.equal(decision.ok, true); assert.equal(decision.exceptionUsed, true);
  assert.equal(decision.exceptionAdvisory, BRACES_ADVISORY);
  assert.equal(decision.exceptionExpires, EXCEPTION_EXPIRES);
  assert.deepEqual(input, before, "full findings must remain unchanged");
});

test("a clean audit does not need an expired exception", () => {
  const input = fixture(); input.full = report(); input.now = "2027-01-01";
  assert.deepEqual(evaluateDependencyAudit(input), { ok: true, exceptionUsed: false, exceptionAdvisory: null, exceptionExpires: null, failures: [] });
});

test("existing moderate findings remain visible and retain the high threshold", () => {
  const input = fixture(); input.full.vulnerabilities.esbuild = { name: "esbuild", severity: "moderate", via: [], nodes: ["node_modules/esbuild"] };
  input.full = report(input.full.vulnerabilities); input.production = report({ esbuild: input.full.vulnerabilities.esbuild });
  assert.equal(evaluateDependencyAudit(input).ok, true);
  assert.equal(input.full.vulnerabilities.esbuild.severity, "moderate");
});

test("all production high findings fail, including the known advisory", () => rejected((i) => { i.production = report({ braces: i.full.vulnerabilities.braces }); }, /Production high/));
test("all production critical findings fail", () => rejected((i) => { i.production = report({ runtime: { name: "runtime", severity: "critical", via: [], nodes: ["node_modules/runtime"] } }); }, /Production critical/));
test("unknown development high findings fail", () => rejected((i) => { i.full.vulnerabilities.other = { name: "other", severity: "high", via: [], nodes: ["node_modules/other"] }; i.full = report(i.full.vulnerabilities); }, /Unapproved high.*other/));
test("critical severity is never excepted", () => rejected((i) => { i.full.vulnerabilities.braces.severity = "critical"; i.full = report(i.full.vulnerabilities); }, /Unapproved critical/));
test("an additional advisory on an excepted package fails", () => rejected((i) => { i.full.vulnerabilities.braces.via.push({ url: "https://github.com/advisories/NEW" }); }, /Unapproved high.*braces/));
test("a changed advisory identity fails", () => rejected((i) => { i.full.vulnerabilities.braces.via[0].url += "-other"; }, /New or changed advisory/));
test("changed advisory affected ranges require review", () => rejected((i) => { i.full.vulnerabilities.braces.via[0].range = "*"; }, /New or changed advisory/));
test("a new vulnerability propagation edge fails", () => rejected((i) => { i.full.vulnerabilities.micromatch.via = ["other"]; }, /New or changed advisory/));
test("missing propagation entries fail closed", () => rejected((i) => { delete i.full.vulnerabilities["fast-glob"]; i.full = report(i.full.vulnerabilities); }, /Incomplete or changed/));
test("relocated audit nodes are not excepted", () => rejected((i) => { i.full.vulnerabilities.braces.nodes = ["node_modules/other/node_modules/braces"]; }, /Unapproved high.*braces/));
test("pinned dependency version drift requires review", () => rejected((i) => { i.lock.packages["node_modules/braces"].version = "3.0.4"; }, /exactly development-only braces@3.0.3/));
test("runtime dependency classification fails", () => rejected((i) => { delete i.lock.packages["node_modules/braces"].dev; }, /development-only/));
test("development-optional mixed classification fails", () => rejected((i) => { i.lock.packages["node_modules/braces"].devOptional = true; }, /development-only/));
test("duplicate dependency copies require review", () => rejected((i) => { i.lock.packages["node_modules/other/node_modules/braces"] = i.lock.packages["node_modules/braces"]; }, /duplicate or relocated/));
test("new consumers invalidate the reachability review", () => rejected((i) => { i.lock.packages["node_modules/other"] = { version: "1.0.0", dev: true, dependencies: { braces: "3.0.3" } }; }, /Unreviewed consumer/));
test("changed dependency range requires review", () => rejected((i) => { i.lock.packages["node_modules/micromatch"].dependencies.braces = "*"; }, /Changed exception dependency edge/));
test("direct runtime package references fail", () => rejected((i) => { i.manifest.dependencies.braces = "3.0.3"; }, /runtime manifest/));
test("unpinning the development dependency fails", () => rejected((i) => { i.manifest.devDependencies["eslint-config-next"] = "^16.3.8"; }, /pinned to 16.3.8/));
test("the exception expires without silent renewal", () => rejected((i) => { i.now = EXCEPTION_EXPIRES; }, /exception expired/));
test("an invalid clock fails closed", () => rejected((i) => { i.now = "invalid"; }, /exception expired/));
test("every effective ESLint config must omit rootDir", () => rejected((i) => { i.resolvedConfigs.push({ file: "app/api/route.ts", settings: { next: { rootDir: "./packages/*" } } }); }, /next.rootDir/));
test("even an empty rootDir must be reviewed", () => rejected((i) => { i.resolvedConfigs[0].settings.next = { rootDir: "" }; }, /next.rootDir/));
test("missing effective-config evidence fails", () => rejected((i) => { i.resolvedConfigs = []; }, /configuration evidence is missing/));
test("missing runtime scan evidence fails", () => rejected((i) => { delete i.runtimeImports; }, /import scan evidence is missing/));
test("application imports invalidate the exception", () => rejected((i) => { i.runtimeImports = [{ file: "lib/runtime.ts", specifier: "braces" }]; }, /Runtime reference/));
test("registry errors cannot be treated as a clean audit", () => rejected((i) => { i.full = { error: { code: "ENOAUDIT" } }; }, /missing, failed, or unsupported/));
test("a missing production report fails closed", () => rejected((i) => { i.production = null; }, /Production audit: missing/));
test("unsupported audit schema requires review", () => rejected((i) => { i.full.auditReportVersion = 3; }, /unsupported/));
test("inconsistent audit counts fail closed", () => rejected((i) => { i.full.metadata.vulnerabilities.high = 0; }, /inconsistent high/));
test("malformed high entries fail without throwing", () => rejected((i) => { delete i.full.vulnerabilities.braces.via; }, /malformed vulnerability/));
