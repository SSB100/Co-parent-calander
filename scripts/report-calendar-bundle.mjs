import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const nextRoot = path.resolve(".next");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(fullPath) : [fullPath];
    }),
  );
  return nested.flat();
}

function rel(file) {
  return path.relative(nextRoot, file).split(path.sep).join("/");
}

function extractChunkRefs(value, output) {
  if (typeof value === "string") {
    for (const match of value.matchAll(/(?:\/_next\/)?(static\/(?:immutable\/)?chunks\/[^"'\\\s]+\.js)/g)) {
      output.add(match[1]);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) extractChunkRefs(item, output);
    return;
  }
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) extractChunkRefs(child, output);
  }
}

function collectCalendarSubtrees(value, output) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectCalendarSubtrees(item, output);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (
      key === "/calendar" ||
      key === "/calendar/page" ||
      key.includes("/calendar/page") ||
      key.includes("app/calendar/page")
    ) {
      extractChunkRefs(child, output);
    } else {
      collectCalendarSubtrees(child, output);
    }
  }
}

const panelSignatures = {
  DayDetailsPanel: ["Shared plans recorded for this day", "Pending changes"],
  EventPanel: ["Create event", "Repeat until"],
  MembersPanel: ["People & access"],
  RecurringSchedulePanel: ["Repeating schedule"],
  RangeAssignmentPanel: ["Apply range", "CalendarRange"],
  SettingsPanel: ["Calendar settings"],
  ActivityPanel: ["Recent activity"],
};

const files = await walk(nextRoot);
const jsChunks = files.filter(
  (file) =>
    file.endsWith(".js") &&
    rel(file).startsWith("static/") &&
    rel(file).includes("/chunks/"),
);

const chunkStats = new Map();
const panelChunks = Object.fromEntries(
  Object.keys(panelSignatures).map((name) => [name, []]),
);

for (const file of jsChunks) {
  const buffer = await readFile(file);
  const key = rel(file);
  const text = buffer.toString("utf8");
  const sizes = {
    file: key,
    rawBytes: buffer.byteLength,
    gzipBytes: gzipSync(buffer, { level: 9 }).byteLength,
    brotliBytes: brotliCompressSync(buffer, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).byteLength,
  };
  chunkStats.set(key, sizes);

  for (const [panel, signatures] of Object.entries(panelSignatures)) {
    if (signatures.some((signature) => text.includes(signature))) {
      panelChunks[panel].push(sizes);
    }
  }
}

const calendarRefs = new Set();
const manifestCandidates = [];

for (const file of files.filter((candidate) =>
  /manifest|reference/i.test(path.basename(candidate)),
)) {
  const key = rel(file);
  const info = await stat(file);
  if (info.size > 20_000_000) continue;

  const text = await readFile(file, "utf8");
  const fileLooksCalendarSpecific =
    /(^|\/)calendar(\/|[-_.])/i.test(key) ||
    /calendar\/page_client-reference-manifest/i.test(key);

  let contributed = false;
  try {
    const parsed = JSON.parse(text);
    const before = calendarRefs.size;
    collectCalendarSubtrees(parsed, calendarRefs);
    contributed = calendarRefs.size > before;
  } catch {
    if (fileLooksCalendarSpecific) {
      const before = calendarRefs.size;
      extractChunkRefs(text, calendarRefs);
      contributed = calendarRefs.size > before;
    }
  }

  if (fileLooksCalendarSpecific || contributed) {
    manifestCandidates.push({ file: key, bytes: info.size, contributed });
  }
}

for (const file of files) {
  const key = rel(file);
  if (!/calendar/i.test(key) || !/manifest|reference/i.test(key)) continue;
  const text = await readFile(file, "utf8");
  extractChunkRefs(text, calendarRefs);
}

const loadableManifestPath = files.find(
  (file) =>
    rel(file) === "server/app/calendar/page/react-loadable-manifest.json",
);
const lazyRefs = new Set();
let loadableManifest = {};
if (loadableManifestPath) {
  loadableManifest = JSON.parse(await readFile(loadableManifestPath, "utf8"));
  extractChunkRefs(loadableManifest, lazyRefs);
}

const resolvedCalendarChunks = [...calendarRefs]
  .map((ref) => chunkStats.get(ref) ?? null)
  .filter(Boolean)
  .sort((a, b) => b.rawBytes - a.rawBytes);
const lazyCalendarChunks = [...lazyRefs]
  .map((ref) => chunkStats.get(ref) ?? null)
  .filter(Boolean)
  .sort((a, b) => b.rawBytes - a.rawBytes);
const initialCalendarChunks = [...calendarRefs]
  .filter((ref) => !lazyRefs.has(ref))
  .map((ref) => chunkStats.get(ref) ?? null)
  .filter(Boolean)
  .sort((a, b) => b.rawBytes - a.rawBytes);

const sum = (rows, field) => rows.reduce((total, row) => total + row[field], 0);
const totalsFor = (rows) => ({
  chunkCount: rows.length,
  rawBytes: sum(rows, "rawBytes"),
  gzipBytes: sum(rows, "gzipBytes"),
  brotliBytes: sum(rows, "brotliBytes"),
});
const totals = totalsFor(initialCalendarChunks);
const allReferencedTotals = totalsFor(resolvedCalendarChunks);
const lazyTotals = totalsFor(lazyCalendarChunks);

console.log("CALENDAR_BUNDLE_REPORT_START");
console.log(
  JSON.stringify(
    {
      totals,
      initialCalendarChunks,
      lazyTotals,
      lazyCalendarChunks,
      allReferencedTotals,
      calendarChunks: resolvedCalendarChunks,
      loadableManifest,
      panelChunks,
      manifestCandidates,
      allClientChunkCount: jsChunks.length,
    },
    null,
    2,
  ),
);
console.log("CALENDAR_BUNDLE_REPORT_END");
