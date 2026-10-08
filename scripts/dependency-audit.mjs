import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ESLint } from "eslint";
import { auditArguments, evaluateDependencyAudit } from "./dependency-audit-policy.mjs";
import { findRestrictedReferences, isRuntimeSource } from "./dependency-audit-source.mjs";

const reportDirectory = path.resolve(process.env.AUDIT_REPORT_DIR || "build/security-audit");
await mkdir(reportDirectory, { recursive: true });

function runAudit(production) {
  const args = auditArguments(production);
  const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args, { encoding: "utf8", timeout: 120_000, maxBuffer: 32 * 1024 * 1024 });
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error || ![0, 1].includes(result.status)) throw new Error(`npm audit failed: ${result.error?.message || `exit ${result.status}`}`);
  return JSON.parse(result.stdout);
}

try {
  const full = runAudit(false);
  await writeFile(path.join(reportDirectory, "full.json"), `${JSON.stringify(full, null, 2)}\n`);
  console.log("Full dependency audit (unfiltered):", JSON.stringify(full, null, 2));
  const production = runAudit(true);
  await writeFile(path.join(reportDirectory, "production.json"), `${JSON.stringify(production, null, 2)}\n`);
  console.log("Production dependency audit (unfiltered):", JSON.stringify(production, null, 2));

  const filesResult = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (filesResult.error || filesResult.status !== 0) throw new Error("Cannot enumerate project sources for the reachability guard");
  const files = [...new Set(filesResult.stdout.split("\0").filter((file) => /\.[cm]?[jt]sx?$/.test(file)))];
  if (!files.length) throw new Error("No project sources found for the reachability guard");
  const eslint = new ESLint();
  const resolvedConfigs = [];
  const runtimeImports = [];
  for (const file of files) {
    const config = await eslint.calculateConfigForFile(file);
    if (config) resolvedConfigs.push({ file, settings: config.settings || {} });
    if (isRuntimeSource(file)) runtimeImports.push(...findRestrictedReferences(file, await readFile(file, "utf8")));
  }
  const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
  const manifest = JSON.parse(await readFile("package.json", "utf8"));
  const decision = evaluateDependencyAudit({ full, production, lock, manifest, resolvedConfigs, runtimeImports });
  await writeFile(path.join(reportDirectory, "policy.json"), `${JSON.stringify({ ...decision, sourceFilesChecked: files.length, eslintConfigurationsChecked: resolvedConfigs.length }, null, 2)}\n`);
  if (!decision.ok) throw new Error(decision.failures.join("\n"));
  console.log(decision.exceptionUsed
    ? `Audit gate passed with the approved development-only braces exception, expiring ${decision.exceptionExpires}. Full findings remain in ${reportDirectory}.`
    : `Audit gate passed without a high/critical exception. Full findings remain in ${reportDirectory}.`);
} catch (error) {
  console.error(`Dependency audit gate failed: ${error.message}`);
  process.exitCode = 1;
}
