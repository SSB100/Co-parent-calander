import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("assignment APIs accept direct split ownership atomically", async () => {
  const bulk = await readFile(path.join(root, "app/api/assignments/route.ts"), "utf8");
  const details = await readFile(path.join(root, "app/api/assignment-details/route.ts"), "utf8");

  assert.match(bulk, /ownershipSchema/);
  assert.match(bulk, /morningParentId/);
  assert.match(bulk, /afternoonParentId/);
  assert.match(details, /ownershipSchema/);
  assert.match(details, /morningParentId/);
  assert.match(details, /afternoonParentId/);
});

test("day editor uses direct custody states and shows events", async () => {
  const panel = await readFile(path.join(root, "components/calendar/day-details-panel.tsx"), "utf8");

  assert.match(panel, /Full day you/);
  assert.match(panel, /them_full/);
  assert.match(panel, /me_then_them/);
  assert.match(panel, /them_then_me/);
  assert.match(panel, /Shared plans recorded for this day/);
  assert.match(panel, /Delete event/);
  assert.doesNotMatch(panel, /Which part of the day\?/);
});

test("calendar bulk controls use direct custody states and create event remains visible", async () => {
  const shell = await readFile(path.join(root, "components/calendar/calendar-shell.tsx"), "utf8");
  const events = await readFile(path.join(root, "components/calendar/event-panel.tsx"), "utf8");

  assert.match(shell, /me_then_them/);
  assert.match(shell, /them_then_me/);
  assert.doesNotMatch(shell, /Bulk assignment period/);
  assert.match(events, /Create event/);
});

test("mobile month grid supports deliberate left and right swipe navigation", async () => {
  const gesture = await readFile(path.join(root, "components/calendar/mobile-calendar-swipe.tsx"), "utf8");
  const layout = await readFile(path.join(root, "app/layout.tsx"), "utf8");
  const styles = await readFile(path.join(root, "app/globals.css"), "utf8");

  assert.match(layout, /MobileCalendarSwipe/);
  assert.match(gesture, /max-width: 767px/);
  assert.match(gesture, /minimumSwipeDistance = 56/);
  assert.match(gesture, /horizontalIntentRatio = 1\.2/);
  assert.match(gesture, /deltaX < 0 \? "Next" : "Previous"/);
  assert.match(gesture, /event\.preventDefault\(\)/);
  assert.match(gesture, /button\[aria-pressed="true"\]/);
  assert.match(styles, /touch-action: pan-y/);
});


test("mobile multi-day selection keeps the calendar usable until assignment is requested", async () => {
  const shell = await readFile(path.join(root, "components/calendar/calendar-shell.tsx"), "utf8");

  assert.match(shell, /Cancel select/);
  assert.match(shell, /covie-mobile-selection-bar/);
  assert.match(shell, /Assign days/);
  assert.match(shell, /bulkEditorOpen/);
  assert.match(shell, /Assign selected days/);
  assert.match(shell, /You can move between months without losing your selection/);

  const moveMonth = shell.slice(
    shell.indexOf("function moveMonth"),
    shell.indexOf("function goToday"),
  );
  const goToday = shell.slice(
    shell.indexOf("function goToday"),
    shell.indexOf("const bulkChoices"),
  );
  assert.doesNotMatch(moveMonth, /setSelectedDays|setSelectionMode|setBulkReason/);
  assert.doesNotMatch(goToday, /setSelectedDays|setSelectionMode|setBulkReason/);
});

test("performance stage 1 consolidates workspace chrome and lazy-loads mobile context", async () => {
  const [nav, comingUp, summaryRoute, loader, vercelConfig] = await Promise.all([
    readFile(path.join(root, "components/workspace/workspace-nav.tsx"), "utf8"),
    readFile(path.join(root, "components/workspace/coming-up.tsx"), "utf8"),
    readFile(path.join(root, "app/api/workspace-summary/route.ts"), "utf8"),
    readFile(path.join(root, "lib/workspace/load-summary.ts"), "utf8"),
    readFile(path.join(root, "vercel.json"), "utf8"),
  ]);

  assert.match(nav, /\/api\/workspace-summary\?context=/);
  assert.doesNotMatch(nav, /\/api\/notifications|\/api\/coming-up/);
  assert.doesNotMatch(comingUp, /fetch\(/);
  assert.match(nav, /matchMedia\("\(min-width: 1024px\)"\)/);
  assert.match(nav, /if \(next\)[\s\S]*refreshWorkspace\(true\)/);

  assert.equal((summaryRoute.match(/getCalendarSession\(\)/g) ?? []).length, 1);
  assert.match(loader, /Promise\.all\([\s\S]*loadNotificationCount\(session\)[\s\S]*loadComingUpContext\(session\)/);
  assert.match(loader, /approvalProposals\.approverMembershipId/);

  const config = JSON.parse(vercelConfig);
  assert.deepEqual(config.regions, ["syd1"]);
});



test("performance stage 2 server-loads the initial calendar range without an API waterfall", async () => {
  const [page, shell, route, loader, session] = await Promise.all([
    readFile(path.join(root, "app/calendar/page.tsx"), "utf8"),
    readFile(path.join(root, "components/calendar/calendar-shell.tsx"), "utf8"),
    readFile(path.join(root, "app/api/calendar/route.ts"), "utf8"),
    readFile(path.join(root, "lib/calendar/load-calendar.ts"), "utf8"),
    readFile(path.join(root, "lib/security/session.ts"), "utf8"),
  ]);

  assert.match(page, /localDateInTimeZone\(session\.calendarTimezone\)/);
  assert.match(page, /calendarRangeForDate\(initialToday\)/);
  assert.match(page, /loadCalendarData\(session, initialRange\)/);
  assert.match(page, /initialData=\{initialData\}/);
  assert.match(page, /initialMonth=\{initialRange\.month\}/);
  assert.doesNotMatch(page, /fetch\s*\(\s*[`"']\/api\/calendar/);

  assert.match(shell, /useState<CalendarPayload \| null>\(initialData\)/);
  assert.match(shell, /loadedRequestRef/);
  assert.match(shell, /loadedRequestRef\.current\.range === requestRange/);
  assert.match(shell, /loadedRequestRef\.current\.refreshKey === refreshKey/);
  assert.match(shell, /fetch\(`\/api\/calendar\?\$\{params\.toString\(\)\}`/);
  assert.match(shell, /setRefreshKey\(\(value\) => value \+ 1\)/);

  assert.match(route, /getCalendarSession\(\)/);
  assert.match(route, /calendarRangeSchema\.safeParse/);
  assert.match(route, /loadCalendarData\(session, parsed\.data\)/);
  assert.doesNotMatch(route, /loadEffectiveAssignmentMap|getDb\(\)|db\.batch/);

  assert.match(loader, /calendarRangeSchema\.parse\(input\)/);
  assert.match(loader, /differenceInCalendarDays/);
  assert.match(loader, /loadEffectiveAssignmentMap/);
  assert.match(loader, /projectCalendarPendingProposals/);
  assert.match(loader, /expandEventOccurrences/);
  assert.match(session, /auth\.getSession\(\)/);
  assert.match(session, /membershipForUser/);
});


test("performance stage 3 server-loads Updates without an initial /api/home waterfall", async () => {
  const [page, shell, route, loader, session] = await Promise.all([
    readFile(path.join(root, "app/home/page.tsx"), "utf8"),
    readFile(path.join(root, "components/home/home-shell.tsx"), "utf8"),
    readFile(path.join(root, "app/api/home/route.ts"), "utf8"),
    readFile(path.join(root, "lib/home/load-home.ts"), "utf8"),
    readFile(path.join(root, "lib/security/session.ts"), "utf8"),
  ]);

  assert.match(page, /getCalendarSession\(\)/);
  assert.match(page, /loadHomeData\(session\)/);
  assert.match(page, /<HomeShell initialData=\{initialData\} \/>/);
  assert.doesNotMatch(page, /fetch\s*\(/);

  assert.match(shell, /HomeShell\(\{ initialData \}/);
  assert.match(shell, /useState<HomePayload>\(initialData\)/);
  assert.doesNotMatch(shell, /useEffect/);
  assert.doesNotMatch(shell, /Loading Updates/);
  assert.match(shell, /const refresh = useCallback/);
  assert.match(shell, /fetch\("\/api\/home"/);
  assert.match(shell, /onChanged=\{\(\) => \{/);

  assert.equal((route.match(/getCalendarSession\(\)/g) ?? []).length, 1);
  assert.match(route, /loadHomeData\(session\)/);
  assert.doesNotMatch(route, /getDb\(\)|listApprovalProposals|expandEventOccurrences/);

  assert.match(loader, /Promise\.all\(/);
  assert.match(loader, /listApprovalProposals/);
  assert.match(loader, /expandEventOccurrences/);
  assert.match(loader, /expenseReimbursementContext/);
  assert.match(loader, /proposalDisplay/);
  assert.doesNotMatch(loader, /NextResponse|getCalendarSession/);

  assert.match(session, /auth\.getSession\(\)/);
  assert.match(session, /membershipForUser/);
});


test("performance stage 4 server-loads Tasks and Shared costs without initial API waterfalls", async () => {
  const [
    taskPage,
    taskShell,
    taskRoute,
    taskService,
    costPage,
    costShell,
    costRoute,
    costService,
    session,
  ] = await Promise.all([
    readFile(path.join(root, "app/responsibilities/page.tsx"), "utf8"),
    readFile(path.join(root, "components/responsibilities/responsibilities-shell.tsx"), "utf8"),
    readFile(path.join(root, "app/api/responsibilities/route.ts"), "utf8"),
    readFile(path.join(root, "lib/responsibilities/service.ts"), "utf8"),
    readFile(path.join(root, "app/expenses/page.tsx"), "utf8"),
    readFile(path.join(root, "components/expenses/expenses-shell.tsx"), "utf8"),
    readFile(path.join(root, "app/api/expenses/route.ts"), "utf8"),
    readFile(path.join(root, "lib/expenses/service.ts"), "utf8"),
    readFile(path.join(root, "lib/security/session.ts"), "utf8"),
  ]);

  assert.match(taskPage, /getCalendarSession\(\)/);
  assert.match(taskPage, /listResponsibilities\(\{/);
  assert.match(taskPage, /initialData=\{initialData\}/);
  assert.doesNotMatch(taskPage, /fetch\s*\(/);

  assert.match(taskShell, /useState<ResponsibilityPayload>\(initialData\)/);
  assert.match(taskShell, /loadedDateRef = useRef<string \| null>\(initialDate\)/);
  assert.match(taskShell, /loadedDateRef\.current === dateFilter/);
  assert.match(taskShell, /fetch\(`\/api\/responsibilities\$\{query\}`/);
  assert.match(taskShell, /const refresh = useCallback/);
  assert.doesNotMatch(taskShell, /Loading tasks/);
  assert.doesNotMatch(taskShell, /setLoading/);

  assert.equal((taskRoute.match(/getCalendarSession\(\)/g) ?? []).length, 1);
  assert.match(taskRoute, /responsibilityDateQuerySchema\.safeParse/);
  assert.match(taskRoute, /listResponsibilities\(\{/);
  assert.match(taskRoute, /getEditorSession\(\)/);
  assert.match(taskRoute, /isSameOriginMutation\(request\)/);

  assert.match(taskService, /completedAt: item\.completedAt\?\.toISOString\(\) \?\? null/);
  assert.match(taskService, /createdAt: item\.createdAt\.toISOString\(\)/);
  assert.match(taskService, /updatedAt: item\.updatedAt\.toISOString\(\)/);
  assert.match(taskService, /status: "waiting" as const/);

  assert.match(costPage, /getCalendarSession\(\)/);
  assert.match(costPage, /listExpenses\(\{/);
  assert.match(costPage, /initialData=\{initialData\}/);
  assert.doesNotMatch(costPage, /fetch\s*\(/);

  assert.match(costShell, /useState<ExpensePayload>\(initialData\)/);
  assert.match(costShell, /loadedDateRef = useRef<string \| null>\(initialDate\)/);
  assert.match(costShell, /loadedDateRef\.current === dateFilter/);
  assert.match(costShell, /fetch\(`\/api\/expenses\$\{query\}`/);
  assert.match(costShell, /const load = useCallback/);
  assert.doesNotMatch(costShell, /Loading shared costs/);
  assert.doesNotMatch(costShell, /setLoading/);

  assert.equal((costRoute.match(/getCalendarSession\(\)/g) ?? []).length, 1);
  assert.match(costRoute, /expenseDateQuerySchema\.safeParse/);
  assert.match(costRoute, /listExpenses\(\{/);
  assert.match(costRoute, /getEditorSession\(\)/);
  assert.match(costRoute, /isSameOriginMutation\(request\)/);

  assert.match(costService, /settledAt: expense\.settledAt\?\.toISOString\(\) \?\? null/);
  assert.match(costService, /createdAt: expense\.createdAt\.toISOString\(\)/);
  assert.match(costService, /updatedAt: expense\.updatedAt\.toISOString\(\)/);
  assert.match(costService, /status: "waiting" as const/);

  assert.match(session, /auth\.getSession\(\)/);
  assert.match(session, /membershipForUser/);
});


test("performance stage 5 keeps heavy closed Calendar panels behind interaction-time boundaries", async () => {
  const [shell, toolsMenu, settingsMenu, eventPanel, dayDetails] = await Promise.all([
    readFile(path.join(root, "components/calendar/calendar-shell.tsx"), "utf8"),
    readFile(path.join(root, "components/calendar/calendar-tools-menu.tsx"), "utf8"),
    readFile(path.join(root, "components/calendar/calendar-settings-menu.tsx"), "utf8"),
    readFile(path.join(root, "components/calendar/event-panel.tsx"), "utf8"),
    readFile(path.join(root, "components/calendar/day-details-panel.tsx"), "utf8"),
  ]);

  assert.match(shell, /import dynamic from "next\/dynamic"/);
  assert.doesNotMatch(shell, /import \{ DayDetailsPanel \} from/);
  assert.doesNotMatch(shell, /import \{ RangeAssignmentPanel \} from/);
  assert.doesNotMatch(shell, /import \{ RecurringSchedulePanel \} from/);
  assert.doesNotMatch(shell, /import \{ ActivityPanel \} from/);
  assert.doesNotMatch(shell, /import \{ MembersPanel \} from/);
  assert.doesNotMatch(shell, /import \{ SettingsPanel \} from/);

  assert.match(shell, /import\("@\/components\/calendar\/day-details-panel"\)/);
  assert.match(shell, /import\("@\/components\/calendar\/calendar-tools-menu"\)/);
  assert.match(shell, /import\("@\/components\/calendar\/calendar-settings-menu"\)/);
  assert.doesNotMatch(shell, /ssr:\s*false/);

  assert.match(shell, /detailsDate && calendarData/);
  assert.match(shell, /toolsMenuOpen/);
  assert.match(shell, /settingsMenuOpen/);
  assert.match(shell, /onToggle=\{\(event\)/);
  assert.match(shell, /<EventPanel includeRangeTools=\{false\}/);
  assert.match(shell, /href="\/responsibilities"/);
  assert.match(shell, /calendarData\?\.permission === "owner"/);
  assert.match(shell, /readOnly=\{accessMode === "viewer"\}/);

  assert.match(toolsMenu, /RangeAssignmentPanel/);
  assert.match(toolsMenu, /RecurringSchedulePanel/);
  assert.match(toolsMenu, /ActivityPanel/);
  assert.match(settingsMenu, /MembersPanel/);
  assert.match(settingsMenu, /SettingsPanel/);

  assert.match(eventPanel, /import dynamic from "next\/dynamic"/);
  assert.match(eventPanel, /import\("@\/components\/calendar\/range-assignment-panel"\)/);
  assert.doesNotMatch(eventPanel, /ssr:\s*false/);

  assert.match(dayDetails, /Shared plans recorded for this day/);
  assert.match(dayDetails, /<EventPanel/);
});
