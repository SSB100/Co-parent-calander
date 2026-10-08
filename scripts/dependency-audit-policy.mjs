export const BRACES_ADVISORY = "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm";
export const EXCEPTION_EXPIRES = "2026-11-07T00:00:00.000Z";
export const DEV_CHAIN = Object.freeze({
  "eslint-config-next": { version: "16.3.8", via: "@next/eslint-plugin-next", range: "16.3.8" },
  "@next/eslint-plugin-next": { version: "16.3.8", via: "fast-glob", range: "3.3.1" },
  "fast-glob": { version: "3.3.1", via: "micromatch", range: "^4.0.4" },
  micromatch: { version: "4.0.8", via: "braces", range: "^3.0.3" },
  braces: { version: "3.0.3" },
});

const severities = ["info", "low", "moderate", "high", "critical"];
const names = Object.keys(DEV_CHAIN);
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const sameArray = (actual, expected) => Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => value === expected[index]);

// Explicit include lists override inherited NODE_ENV/npm omit/include defaults.
export function auditArguments(production) {
  return ["audit", "--package-lock-only", "--audit-level=high", "--json",
    ...(production ? ["--omit=dev", "--include=prod"] : ["--include=dev"]),
    "--include=optional", "--include=peer"];
}

function readReport(report, label, failures) {
  if (!isRecord(report) || report.error || report.auditReportVersion !== 2 || !isRecord(report.vulnerabilities) || !isRecord(report.metadata?.vulnerabilities)) {
    failures.push(`${label}: missing, failed, or unsupported npm audit report`);
    return [];
  }
  const entries = Object.entries(report.vulnerabilities);
  for (const [name, entry] of entries) {
    if (!isRecord(entry) || entry.name !== name || !severities.includes(entry.severity) || !Array.isArray(entry.via) || !Array.isArray(entry.nodes)) {
      failures.push(`${label}: malformed vulnerability entry ${name}`);
    }
  }
  for (const severity of severities) {
    const count = report.metadata.vulnerabilities[severity];
    if (!Number.isInteger(count) || count < 0 || count !== entries.filter(([, entry]) => entry?.severity === severity).length) {
      failures.push(`${label}: inconsistent ${severity} vulnerability count`);
    }
  }
  if (report.metadata.vulnerabilities.total !== entries.length) failures.push(`${label}: inconsistent total vulnerability count`);
  return entries.filter(([, entry]) => isRecord(entry));
}

function checkDevGraph(lock, manifest, failures) {
  if (lock?.lockfileVersion !== 3 || !isRecord(lock.packages) || !isRecord(manifest)) {
    failures.push("Exception requires a valid v3 lockfile and package manifest");
    return;
  }
  for (const name of names) {
    const expected = DEV_CHAIN[name];
    const path = `node_modules/${name}`;
    const entry = lock.packages[path];
    if (!entry || entry.version !== expected.version || entry.dev !== true || entry.devOptional === true || entry.link === true) {
      failures.push(`Exception requires exactly development-only ${name}@${expected.version}`);
    }
    const occurrences = Object.keys(lock.packages).filter((key) => key === path || key.endsWith(`/${path}`));
    if (!sameArray(occurrences, [path])) failures.push(`Exception does not cover duplicate or relocated ${name}`);
    if (expected.via && entry?.dependencies?.[expected.via] !== expected.range) failures.push(`Changed exception dependency edge: ${name}`);
    if (manifest.dependencies?.[name] || manifest.optionalDependencies?.[name] || manifest.peerDependencies?.[name]) failures.push(`Exception package added to runtime manifest: ${name}`);
  }
  if (manifest.devDependencies?.["eslint-config-next"] !== "16.3.8" || lock.packages[""]?.devDependencies?.["eslint-config-next"] !== "16.3.8") {
    failures.push("Exception requires eslint-config-next pinned to 16.3.8 as a dev dependency");
  }
  // A new consumer can invalidate the reachability review even if npm still labels it dev-only.
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!isRecord(entry)) { failures.push(`Malformed lockfile entry: ${path}`); continue; }
    for (const section of ["dependencies", "optionalDependencies", "peerDependencies", "devDependencies"]) {
      for (const name of names) {
        if (!Object.hasOwn(entry[section] || {}, name)) continue;
        const rootEdge = path === "" && section === "devDependencies" && name === "eslint-config-next";
        const parent = path.startsWith("node_modules/") ? DEV_CHAIN[path.slice("node_modules/".length)] : undefined;
        const reviewedEdge = section === "dependencies" && parent?.via === name;
        if (!rootEdge && !reviewedEdge) failures.push(`Unreviewed consumer of ${name}: ${path || "root"} (${section})`);
      }
    }
  }
}

/** Pure, fail-closed decision. This never modifies or filters either npm audit report. */
export function evaluateDependencyAudit({ full, production, lock, manifest, resolvedConfigs, runtimeImports, now = new Date() }) {
  const failures = [];
  const fullEntries = readReport(full, "Full audit", failures);
  const productionEntries = readReport(production, "Production audit", failures);
  for (const [name, entry] of productionEntries) {
    if (["high", "critical"].includes(entry.severity)) failures.push(`Production ${entry.severity} vulnerability: ${name}`);
  }
  const highEntries = fullEntries.filter(([, entry]) => ["high", "critical"].includes(entry.severity));
  const exceptionEntries = [];
  for (const [name, entry] of highEntries) {
    const expected = DEV_CHAIN[name];
    if (!expected || entry.severity !== "high" || !sameArray(entry.nodes, [`node_modules/${name}`]) || !Array.isArray(entry.via) || entry.via.length !== 1) {
      failures.push(`Unapproved ${entry.severity} vulnerability: ${name}`);
      continue;
    }
    const via = entry.via[0];
    const reviewed = expected.via
      ? via === expected.via
      : isRecord(via) && via.url === BRACES_ADVISORY && via.name === "braces" && via.dependency === "braces" && via.severity === "high" && via.range === "<=3.0.3";
    if (!reviewed) failures.push(`New or changed advisory in exception chain: ${name}`);
    else exceptionEntries.push(name);
  }
  if (exceptionEntries.length) {
    if (!sameArray([...exceptionEntries].sort(), [...names].sort())) failures.push("Incomplete or changed braces advisory chain; re-review required");
    if (!Number.isFinite(new Date(now).getTime()) || new Date(now) >= new Date(EXCEPTION_EXPIRES)) failures.push(`Development exception expired at ${EXCEPTION_EXPIRES}`);
    checkDevGraph(lock, manifest, failures);
    if (!Array.isArray(resolvedConfigs) || resolvedConfigs.length === 0) failures.push("Resolved ESLint configuration evidence is missing");
    else for (const config of resolvedConfigs) {
      if (!config?.file || !isRecord(config.settings)) failures.push("Malformed resolved ESLint configuration evidence");
      else if (config.settings.next !== undefined && !isRecord(config.settings.next)) failures.push(`Malformed ESLint next settings for ${config.file}`);
      else if (Object.hasOwn(config.settings.next || {}, "rootDir")) failures.push(`ESLint next.rootDir is configured for ${config.file}`);
    }
    if (!Array.isArray(runtimeImports)) failures.push("Runtime import scan evidence is missing");
    else for (const item of runtimeImports) failures.push(`Runtime reference to a development lint dependency: ${item.file}: ${item.specifier}`);
  }
  return { ok: failures.length === 0, exceptionUsed: exceptionEntries.length > 0, exceptionAdvisory: exceptionEntries.length ? BRACES_ADVISORY : null, exceptionExpires: exceptionEntries.length ? EXCEPTION_EXPIRES : null, failures };
}
