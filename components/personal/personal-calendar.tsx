"use client";

import { ArrowUpRight, List, Bell, House, CalendarDays, ChevronLeft, ChevronRight, LockKeyhole, Plus, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";
import { openPersonalSource } from "@/app/personal/actions";
import { CovieButton, CovieEmptyState, CovieIconButton, CovieInput, CovieNotice, CoviePage, CoviePageActions, CoviePageHeader, CovieRecordCard, CovieSectionHeader, CovieSegmentedControl, CovieSelect, CovieStatusBadge } from "@/components/ui/covie";
import { localDateInTimeZone } from "@/lib/calendar/time";
import type { PersonalData, PersonalItem, PersonalSource, PersonalState } from "@/lib/personal/contracts";
import { calendarTemplateManifests } from "@/lib/templates/calendar-templates";
import { PersonalMonthCalendar } from "./personal-month-calendar";
import { isPersonalMonth, personalDateLabel, personalFirstMonth, personalItemTime, personalItemsByDay, personalLastMonth, personalMonthDays, personalMonthLabel, personalOverview, personalTimezoneOptions, shiftPersonalDate, shiftPersonalMonth } from "./personal-ui";
import { usePersonalCalendar } from "./use-personal-calendar";
import styles from "./personal.module.css";
import { CalendarIdentity } from "@/components/workspace/calendar-identity";
import identityStyles from "@/components/workspace/calendar-identity.module.css";

const viewOptions = [{ value: "month", label: "Month" }, { value: "agenda", label: "Agenda" }, { value: "overview", label: "Overview" }] as const;
const stateInfo = {
  confirmed: { title: "Confirmed commitments", label: "Confirmed", tone: "teal" },
  tentative: { title: "Tentative plans", label: "Tentative", tone: "sunshine" },
  background: { title: "Care context", label: "Care", tone: "violet" },
  attention: { title: "Needs your attention", label: "Needs attention", tone: "sunshine" },
} as const;
const visibleStates = ["confirmed", "tentative", "background"] as const;
const subscribeToBrowserZone = () => () => {};
const readBrowserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverBrowserZone = () => "";

function SourceButton({ name }: { name: string }) {
  const { pending } = useFormStatus();
  return <CovieButton type="submit" tone="neutral" disabled={pending} aria-label={`Open source calendar: ${name}`}>
    {pending ? "Opening…" : "Open source"}<ArrowUpRight size={16} aria-hidden="true" />
  </CovieButton>;
}

function PersonalRecord({ item, source, timezone }: { item: PersonalItem; source: PersonalSource; timezone: string }) {
  const state = stateInfo[item.state];
  return <CovieRecordCard className={styles.record}>
    <div className={styles.recordTop}>
      <span className={styles.sourceName}><CalendarDays size={14} aria-hidden="true" />{source.name}</span>
      <CovieStatusBadge tone={state.tone}>{state.label}</CovieStatusBadge>
    </div>
    <h4>{item.title}</h4>
    <p className={styles.itemTime}>{personalItemTime(item, timezone)}</p>
    {item.detail ? <p className={styles.help}>{item.detail}</p> : null}
    <div className={styles.recordFooter}>
      <span className={styles.help}>{calendarTemplateManifests[source.type].name}{item.start && item.timezone !== timezone ? ` · Source: ${item.timezone}` : ""}</span>
      <form action={openPersonalSource}>
        <input type="hidden" name="calendarId" value={item.calendarId} />
        <input type="hidden" name="target" value={item.sourceTarget} />
        <input type="hidden" name="sourceId" value={item.sourceId} />
        <input type="hidden" name="date" value={item.date} />
        <SourceButton name={source.name} />
      </form>
    </div>
  </CovieRecordCard>;
}

function StateRecords({ items, sources, timezone, state }: { items: PersonalItem[]; sources: Map<string, PersonalSource>; timezone: string; state: PersonalState }) {
  const matching = items.filter((item) => item.state === state && sources.has(item.calendarId));
  if (!matching.length) return null;
  const info = stateInfo[state];
  return <section className={styles.stateGroup} aria-label={info.title}>
    <h3 className={styles.groupTitle}><span data-state={state} aria-hidden="true" />{info.title}<span className={styles.count}>{matching.length}</span></h3>
    {matching.map((item) => <PersonalRecord key={item.id} item={item} source={sources.get(item.calendarId)!} timezone={timezone} />)}
  </section>;
}

function PersonalAttention({ data, sources, timezone, loading, compact }: { data: PersonalData | null; sources: Map<string, PersonalSource>; timezone: string; loading: boolean; compact: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const items = (data?.attention ?? []).filter((item) => sources.has(item.calendarId));
  const visible = compact && !expanded ? items.slice(0, 3) : items;
  return <section className={styles.attention} aria-label="Needs your attention" aria-busy={loading}>
    <CovieSectionHeader title="Needs your attention" description="Outstanding tasks and shared costs through this month, all waiting approvals, and upcoming events you organise this month. These aren’t booked time." />
    {data ? items.length ? <>
      <div className={styles.attentionRecords}>{visible.map((item) => <PersonalRecord key={item.id} item={item} source={sources.get(item.calendarId)!} timezone={timezone} />)}</div>
      {compact && items.length > 3 ? <CovieButton className={styles.sectionAction} tone="neutral" onClick={() => setExpanded(!expanded)}>{expanded ? "Show fewer" : `Show all ${items.length} attention items`}</CovieButton> : null}
    </> : <p className={styles.help}>No outstanding tasks or shared costs through this month, waiting approvals, or upcoming events to organise in the selected calendars.</p> : <p className={styles.help}>{loading ? "Checking items that need attention…" : "Refresh to check items that need attention."}</p>}
  </section>;
}

export function PersonalCalendar({ initialData, pageNotice }: { initialData: PersonalData; pageNotice?: string }) {
  const [month, setMonth] = useState(initialData.month);
  const [timezone, setTimezone] = useState(initialData.timezone);
  const [source, setSource] = useState("");
  const [selectedDate, setSelectedDate] = useState(initialData.today.startsWith(initialData.month) ? initialData.today : `${initialData.month}-01`);
  const [view, setView] = useState<"overview" | "month" | "agenda">("month");
  const [dayContext, setDayContext] = useState<"day" | "attention">("day");
  const [dismissedNotice, setDismissedNotice] = useState("");
  const { data, sources, loading, error, refresh } = usePersonalCalendar(initialData, { month, timezone, source });
  const browserZone = useSyncExternalStore(subscribeToBrowserZone, readBrowserZone, serverBrowserZone);
  const days = useMemo(() => personalMonthDays(month), [month]);
  const itemsByDay = useMemo(() => personalItemsByDay(data?.items ?? [], days.filter((day) => day.startsWith(month)), timezone), [data, days, month, timezone]);
  const sourceMap = useMemo(() => new Map((data?.sources ?? []).map((entry) => [entry.id, entry])), [data]);
  const overview = useMemo(() => data ? personalOverview(data) : null, [data]);
  const todayItems = overview?.todayItems;
  const visibleToday = visibleStates.flatMap((state) => todayItems?.filter((item) => item.state === state) ?? []).slice(0, 6);
  const today = data?.today ?? (timezone === initialData.timezone ? initialData.today : "");
  const selectedItems = itemsByDay.get(selectedDate) ?? [];
  const agendaDays = days.filter((day) => day.startsWith(month) && (itemsByDay.get(day)?.length ?? 0) > 0);
  const selectDate = (date: string) => { if (isPersonalMonth(date.slice(0, 7))) { setSelectedDate(date); setMonth(date.slice(0, 7)); setDayContext("day"); } };
  const selectMonth = (next: string) => {
    if (!isPersonalMonth(next)) return;
    setMonth(next);
    setSelectedDate(today.startsWith(next) ? today : `${next}-01`);
  };
  const openToday = () => { selectDate(localDateInTimeZone(timezone)); setView("month"); };

  return <CoviePage className={styles.page}>
    <CalendarIdentity />
    <CoviePageHeader accent="coral" title="Personal" context="Your commitments, together in one place." actions={<CoviePageActions className={styles.headerActions}>
      <Link href="/calendar" prefetch={false} className={`covie-button covie-primary-action ${styles.desktopCalendarLink}`}>Your calendars</Link>
      <Link href="/onboarding" prefetch={false} className="covie-button covie-action-secondary"><Plus size={16} aria-hidden="true" />Add calendar</Link>

    </CoviePageActions>} />

    <div className={styles.intro}>
      <span className={styles.privateLabel}><LockKeyhole size={15} aria-hidden="true" />Only visible to you</span>
      <p>Open an item’s source to make a change.</p>
    </div>

    {pageNotice && pageNotice !== dismissedNotice ? <CovieNotice tone="sunshine"><div className={styles.pageNotice}><p>{pageNotice}</p><CovieIconButton aria-label="Dismiss notice" onClick={() => setDismissedNotice(pageNotice)}><X size={17} aria-hidden="true" /></CovieIconButton></div></CovieNotice> : null}

    {sources.length > 0 || source ? <>
    <details className={styles.filterDisclosure}>
      <summary><span>Sources &amp; timezone</span><span className={styles.filterSummary}>{source ? sources.find((entry) => entry.id === source)?.name ?? "Selected calendar (unavailable)" : "All calendars"} · {timezone}</span></summary>
      <div className={styles.filters}>
      <label className={styles.field}><span>Calendar source</span><CovieSelect value={source} onChange={(event) => setSource(event.target.value)}>
        <option value="">All calendars</option>
        {source && !sources.some((entry) => entry.id === source) ? <option value={source}>Selected calendar (unavailable)</option> : null}
        {sources.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {calendarTemplateManifests[entry.type].name}</option>)}
      </CovieSelect></label>
      <label className={styles.field}><span>Display timezone</span><CovieSelect value={timezone} onChange={(event) => setTimezone(event.target.value)}>
        {personalTimezoneOptions(timezone, sources, browserZone).map((zone) => <option key={zone} value={zone}>{zone}{zone === browserZone ? " · this device" : ""}</option>)}
      </CovieSelect></label>
      <p className={styles.filterNote}>Times follow your display timezone. Care and due dates keep their source calendar’s date.</p>
      </div>
    </details>

    <div className={styles.toolbar}>
      <div className={styles.monthControls}>
        <CovieIconButton aria-label="Previous month" disabled={month === personalFirstMonth} onClick={() => selectMonth(shiftPersonalMonth(month, -1))}><ChevronLeft size={19} aria-hidden="true" /></CovieIconButton>
        <label className={styles.monthField}><span className="sr-only">Choose month</span><CovieInput type="month" min={personalFirstMonth} max={personalLastMonth} value={month} onChange={(event) => selectMonth(event.target.value)} /></label>
        <CovieIconButton aria-label="Next month" disabled={month === personalLastMonth} onClick={() => selectMonth(shiftPersonalMonth(month, 1))}><ChevronRight size={19} aria-hidden="true" /></CovieIconButton>
        <CovieButton tone="neutral" onClick={() => selectDate(localDateInTimeZone(timezone))}>Today</CovieButton>
      </div>
      <div className={styles.viewControls}><CovieSegmentedControl value={view} options={viewOptions} onChange={setView} ariaLabel="Personal calendar view" tone="coral" />
      <CovieIconButton aria-label={loading ? "Refreshing Personal" : "Refresh Personal"} onClick={() => void refresh()} disabled={loading}><RefreshCw size={17} aria-hidden="true" /></CovieIconButton>
      </div>
    </div>

    {view !== "overview" ? <div className={styles.legend} aria-label="Calendar legend">{visibleStates.map((state) => <span key={state}><i data-state={state} aria-hidden="true" />{stateInfo[state].label}</span>)}<span className={styles.help}>Care is context for your day.</span></div> : null}
    </> : null}

    {error ? <CovieNotice tone="danger"><p>{error}</p><div className={styles.noticeActions}><CovieButton tone="neutral" onClick={() => void refresh()}>Try again</CovieButton>{source ? <CovieButton tone="neutral" onClick={() => setSource("")}>All calendars</CovieButton> : null}</div></CovieNotice> : null}
    {data?.warnings.map((warning, index) => <CovieNotice key={`${index}-${warning}`} tone="sunshine">{warning}</CovieNotice>)}
    <div role="status" aria-live="polite" className={loading ? styles.loading : "sr-only"}>{loading ? "Refreshing your personal calendar…" : data ? `${personalMonthLabel(month)} loaded. ${data.items.length} calendar items and ${data.attention.length} items needing attention.` : "Calendar items are unavailable."}</div>

    {data && !data.sources.length ? <CovieEmptyState icon={<CalendarDays aria-hidden="true" />} title="Welcome to Personal" description="Your own shifts, appointments and shared plans will appear here. Create or join a calendar whenever you’re ready." action={<Link href="/onboarding" prefetch={false} className="covie-button covie-primary-action">Create or join a calendar</Link>} /> : <>
      {view === "overview" ? <>
        <section className={styles.overviewSection} aria-label="Today" aria-busy={loading}>
          <CovieSectionHeader title="Today" description={today ? personalDateLabel(today, true) : "Your day in the selected display timezone."} actions={todayItems?.length ? <CovieButton tone="neutral" onClick={openToday}>View today</CovieButton> : undefined} />
          {overview ? todayItems ? todayItems.length ? <>
            <div className={styles.todayRecords}>{visibleStates.map((state) => <StateRecords key={state} state={state} items={visibleToday} sources={sourceMap} timezone={timezone} />)}</div>
            {todayItems.length > visibleToday.length ? <p className={styles.help}>Showing {visibleToday.length} of {todayItems.length} items. View today for the full day.</p> : null}
          </> : <p className={styles.help}>No commitments or care context today from the selected calendars.</p> : <div className={styles.outsideMonth}><p className={styles.help}>Today is outside {personalMonthLabel(month)}. Load today’s month to see your commitments.</p><CovieButton tone="neutral" onClick={() => selectDate(localDateInTimeZone(timezone))}>Load today’s month</CovieButton></div> : <p className={styles.help}>{loading ? "Your day is loading." : "Refresh to see today’s items."}</p>}
        </section>

        <PersonalAttention data={data} sources={sourceMap} timezone={timezone} loading={loading} compact />

        <section className={styles.overviewSection} aria-label="Upcoming" aria-busy={loading}>
          <CovieSectionHeader title={`Upcoming in ${personalMonthLabel(month)}`} description="Confirmed and tentative plans after today, within this month only. Open Month or Agenda to see care context and other dates." actions={<CovieButton tone="neutral" onClick={() => setView("agenda")}>View month agenda</CovieButton>} />
          {overview ? overview.upcoming.length ? <>
            <div className={styles.upcomingRecords}>{overview.upcoming.slice(0, 5).map((item) => <PersonalRecord key={item.id} item={item} source={sourceMap.get(item.calendarId)!} timezone={timezone} />)}</div>
            {overview.upcoming.length > 5 ? <p className={styles.help}>Showing the next 5 of {overview.upcoming.length} plans in this month. View the month agenda for the full list.</p> : null}
          </> : <p className={styles.help}>No upcoming confirmed or tentative plans in {personalMonthLabel(month)} from the selected calendars. Other months aren’t included.</p> : <p className={styles.help}>{loading ? "Your upcoming plans are loading." : "Refresh to see upcoming plans."}</p>}
        </section>
      </> : <>
      <section className={styles.schedule} aria-label={personalMonthLabel(month)} aria-busy={loading}>
        {view === "month" ? <>
          <div className={styles.monthColumn}>
            <h2 className={styles.monthHeading}>{personalMonthLabel(month)}</h2>
            <PersonalMonthCalendar month={month} days={days} itemsByDay={itemsByDay} selectedDate={selectedDate} today={today} onSelectDate={selectDate} />
            <p className={styles.help}>Choose a day to see your commitments. Use arrow keys to move around the calendar.</p>
          </div>
          <section id="personal-day-context" className={styles.dayPanel} aria-label="Selected day">
            <CovieSegmentedControl value={dayContext} onChange={setDayContext} ariaLabel="Personal day context" options={[{ value: "day", label: "Your day" }, { value: "attention", label: `Attention${data?.attention.length ? ` (${data.attention.length})` : ""}` }]} />
            {dayContext === "attention" ? <PersonalAttention data={data} sources={sourceMap} timezone={timezone} loading={loading} compact={false} /> : <>
            <CovieSectionHeader title={personalDateLabel(selectedDate)} actions={<div className={styles.dayControls}><CovieIconButton aria-label="Previous day" disabled={selectedDate === `${personalFirstMonth}-01`} onClick={() => selectDate(shiftPersonalDate(selectedDate, -1))}><ChevronLeft size={18} aria-hidden="true" /></CovieIconButton><CovieIconButton aria-label="Next day" disabled={selectedDate === `${personalLastMonth}-31`} onClick={() => selectDate(shiftPersonalDate(selectedDate, 1))}><ChevronRight size={18} aria-hidden="true" /></CovieIconButton></div>} />
            {data ? selectedItems.length ? visibleStates.map((state) => <StateRecords key={state} state={state} items={selectedItems} sources={sourceMap} timezone={timezone} />) : <CovieEmptyState title="Room in your day" description="No personal commitments or care context from the selected calendars on this day." /> : <p className={styles.help}>{loading ? "Your day is loading." : "Refresh to see this day’s items."}</p>}
            </>}
          </section>
        </> : <section className={styles.agenda} aria-label="Monthly agenda">
          <CovieSectionHeader title={`${personalMonthLabel(month)} agenda`} description="Your confirmed plans, tentative plans and care context, day by day." />
          {data ? agendaDays.length ? agendaDays.map((day) => <section key={day} className={styles.agendaDay} aria-label={personalDateLabel(day, true)}><button type="button" className={styles.agendaDate} onClick={() => { selectDate(day); setView("month"); }}>{personalDateLabel(day)}<ArrowUpRight size={16} aria-hidden="true" /><span className="sr-only">Open day</span></button><div className={styles.agendaRecords}>{visibleStates.map((state) => <StateRecords key={state} state={state} items={itemsByDay.get(day)!} sources={sourceMap} timezone={timezone} />)}</div></section>) : <CovieEmptyState title="No plans in this month" description="Your own confirmed commitments, tentative plans and care context will appear here when they’re added in a source calendar." /> : <p className={styles.help}>{loading ? "Your agenda is loading." : "Refresh to see your agenda."}</p>}
        </section>}
      </section>

      {view === "agenda" ? <PersonalAttention data={data} sources={sourceMap} timezone={timezone} loading={loading} compact={false} /> : null}
      </>}
    </>}
    <nav className={identityStyles.footer} aria-label="Personal navigation">
      <button type="button" aria-pressed={view === "month" && dayContext !== "attention"} onClick={() => { setView("month"); setDayContext("day"); window.scrollTo({ top: 0, behavior: "instant" }); }}><CalendarDays size={20} aria-hidden="true" />Month</button>
      <button type="button" aria-pressed={view === "agenda"} onClick={() => { setView("agenda"); window.scrollTo({ top: 0, behavior: "instant" }); }}><List size={20} aria-hidden="true" />Agenda</button>
      <button type="button" aria-pressed={view === "month" && dayContext === "attention"} onClick={() => { setView("month"); setDayContext("attention"); window.requestAnimationFrame(() => document.getElementById("personal-day-context")?.scrollIntoView({ block: "start", behavior: "instant" })); }}><Bell size={20} aria-hidden="true" />Attention</button>
      <Link href="/calendar" prefetch={false}><House size={20} aria-hidden="true" />Calendars</Link>
    </nav>
  </CoviePage>;
}
