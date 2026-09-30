"use client";

import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, LockKeyhole, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";
import { openPersonalSource } from "@/app/personal/actions";
import { CovieButton, CovieCard, CovieEmptyState, CovieIconButton, CovieInput, CovieNotice, CoviePage, CoviePageActions, CoviePageHeader, CovieRecordCard, CovieSectionHeader, CovieSegmentedControl, CovieSelect, CovieStatusBadge } from "@/components/ui/covie";
import { localDateInTimeZone } from "@/lib/calendar/time";
import type { PersonalData, PersonalItem, PersonalSource, PersonalState } from "@/lib/personal/contracts";
import { calendarTemplateManifests } from "@/lib/templates/calendar-templates";
import { PersonalMonthCalendar } from "./personal-month-calendar";
import { isPersonalMonth, personalDateLabel, personalFirstMonth, personalItemTime, personalItemsByDay, personalLastMonth, personalMonthDays, personalMonthLabel, personalTimezoneOptions, shiftPersonalDate, shiftPersonalMonth } from "./personal-ui";
import { usePersonalCalendar } from "./use-personal-calendar";
import styles from "./personal.module.css";

const viewOptions = [{ value: "month", label: "Month" }, { value: "agenda", label: "Agenda" }] as const;
const stateInfo = {
  confirmed: { title: "Confirmed commitments", label: "Confirmed", tone: "teal" },
  tentative: { title: "Tentative plans", label: "Tentative", tone: "sunshine" },
  background: { title: "Care context", label: "Care", tone: "violet" },
  attention: { title: "Needs your attention", label: "Needs attention", tone: "coral" },
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

export function PersonalCalendar({ initialData, pageNotice }: { initialData: PersonalData; pageNotice?: string }) {
  const [month, setMonth] = useState(initialData.month);
  const [timezone, setTimezone] = useState(initialData.timezone);
  const [source, setSource] = useState("");
  const [selectedDate, setSelectedDate] = useState(initialData.today.startsWith(initialData.month) ? initialData.today : `${initialData.month}-01`);
  const [view, setView] = useState<"month" | "agenda">("month");
  const [dismissedNotice, setDismissedNotice] = useState("");
  const { data, sources, loading, error, refresh } = usePersonalCalendar(initialData, { month, timezone, source });
  const browserZone = useSyncExternalStore(subscribeToBrowserZone, readBrowserZone, serverBrowserZone);
  const days = useMemo(() => personalMonthDays(month), [month]);
  const itemsByDay = useMemo(() => personalItemsByDay(data?.items ?? [], days.filter((day) => day.startsWith(month)), timezone), [data, days, month, timezone]);
  const sourceMap = useMemo(() => new Map((data?.sources ?? []).map((entry) => [entry.id, entry])), [data]);
  const today = data?.today ?? (timezone === initialData.timezone ? initialData.today : "");
  const selectedItems = itemsByDay.get(selectedDate) ?? [];
  const agendaDays = days.filter((day) => day.startsWith(month) && (itemsByDay.get(day)?.length ?? 0) > 0);
  const selectDate = (date: string) => { if (isPersonalMonth(date.slice(0, 7))) { setSelectedDate(date); setMonth(date.slice(0, 7)); } };
  const selectMonth = (next: string) => {
    if (!isPersonalMonth(next)) return;
    setMonth(next);
    setSelectedDate(today.startsWith(next) ? today : `${next}-01`);
  };

  return <CoviePage className={styles.page}>
    <CoviePageHeader accent="coral" title="Personal" context="Your commitments, together in one place." actions={<CoviePageActions>
      <Link href="/calendar" prefetch={false} className="covie-button covie-action-secondary">Your calendars<ArrowUpRight size={16} aria-hidden="true" /></Link>
      <CovieButton onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} aria-hidden="true" />{loading ? "Refreshing…" : "Refresh"}</CovieButton>
    </CoviePageActions>} />

    <div className={styles.intro}>
      <span className={styles.privateLabel}><LockKeyhole size={15} aria-hidden="true" />Only visible to you</span>
      <p>Shared calendars stay separate. Open an item’s source to make a change.</p>
    </div>

    {pageNotice && pageNotice !== dismissedNotice ? <CovieNotice tone="sunshine"><div className={styles.pageNotice}><p>{pageNotice}</p><CovieIconButton aria-label="Dismiss notice" onClick={() => setDismissedNotice(pageNotice)}><X size={17} aria-hidden="true" /></CovieIconButton></div></CovieNotice> : null}

    <CovieCard className={styles.filters}>
      <label className={styles.field}><span>Calendar source</span><CovieSelect value={source} onChange={(event) => setSource(event.target.value)}>
        <option value="">All calendars</option>
        {source && !sources.some((entry) => entry.id === source) ? <option value={source}>Selected calendar (unavailable)</option> : null}
        {sources.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {calendarTemplateManifests[entry.type].name}</option>)}
      </CovieSelect></label>
      <label className={styles.field}><span>Display timezone</span><CovieSelect value={timezone} onChange={(event) => setTimezone(event.target.value)}>
        {personalTimezoneOptions(timezone, sources, browserZone).map((zone) => <option key={zone} value={zone}>{zone}{zone === browserZone ? " · this device" : ""}</option>)}
      </CovieSelect></label>
      <p className={styles.filterNote}>Times follow your display timezone. Care and due dates keep their source calendar’s date.</p>
    </CovieCard>

    <div className={styles.toolbar}>
      <div className={styles.monthControls}>
        <CovieIconButton aria-label="Previous month" disabled={month === personalFirstMonth} onClick={() => selectMonth(shiftPersonalMonth(month, -1))}><ChevronLeft size={19} aria-hidden="true" /></CovieIconButton>
        <label className={styles.monthField}><span className="sr-only">Choose month</span><CovieInput type="month" min={personalFirstMonth} max={personalLastMonth} value={month} onChange={(event) => selectMonth(event.target.value)} /></label>
        <CovieIconButton aria-label="Next month" disabled={month === personalLastMonth} onClick={() => selectMonth(shiftPersonalMonth(month, 1))}><ChevronRight size={19} aria-hidden="true" /></CovieIconButton>
        <CovieButton tone="neutral" onClick={() => selectDate(localDateInTimeZone(timezone))}>Today</CovieButton>
      </div>
      <CovieSegmentedControl value={view} options={viewOptions} onChange={setView} ariaLabel="Personal calendar view" tone="coral" />
    </div>

    <div className={styles.legend} aria-label="Calendar legend">{visibleStates.map((state) => <span key={state}><i data-state={state} aria-hidden="true" />{stateInfo[state].label}</span>)}<span className={styles.help}>Care is context for your day.</span></div>

    {error ? <CovieNotice tone="danger"><p>{error}</p><div className={styles.noticeActions}><CovieButton tone="neutral" onClick={() => void refresh()}>Try again</CovieButton>{source ? <CovieButton tone="neutral" onClick={() => setSource("")}>All calendars</CovieButton> : null}</div></CovieNotice> : null}
    {data?.warnings.map((warning, index) => <CovieNotice key={`${index}-${warning}`} tone="sunshine">{warning}</CovieNotice>)}
    <div role="status" aria-live="polite" className={loading ? styles.loading : "sr-only"}>{loading ? "Refreshing your personal calendar…" : data ? `${personalMonthLabel(month)} loaded. ${data.items.length} calendar items and ${data.attention.length} items needing attention.` : "Calendar items are unavailable."}</div>

    {data && !data.sources.length ? <CovieEmptyState icon={<CalendarDays aria-hidden="true" />} title="A little space for your plans" description="Personal brings together your own commitments from calendars you choose to join or create. You don’t have any shared calendars yet." action={<Link href="/onboarding" prefetch={false} className="covie-button covie-primary-action">Choose a calendar</Link>} /> : <>
      <section className={styles.schedule} aria-label={personalMonthLabel(month)} aria-busy={loading}>
        {view === "month" ? <>
          <div className={styles.monthColumn}>
            <h2 className={styles.monthHeading}>{personalMonthLabel(month)}</h2>
            <PersonalMonthCalendar month={month} days={days} itemsByDay={itemsByDay} selectedDate={selectedDate} today={today} onSelectDate={selectDate} />
            <p className={styles.help}>Choose a day to see your commitments. Use arrow keys to move around the calendar.</p>
          </div>
          <section className={styles.dayPanel} aria-label="Selected day">
            <CovieSectionHeader title={personalDateLabel(selectedDate)} actions={<div className={styles.dayControls}><CovieIconButton aria-label="Previous day" disabled={selectedDate === `${personalFirstMonth}-01`} onClick={() => selectDate(shiftPersonalDate(selectedDate, -1))}><ChevronLeft size={18} aria-hidden="true" /></CovieIconButton><CovieIconButton aria-label="Next day" disabled={selectedDate === `${personalLastMonth}-31`} onClick={() => selectDate(shiftPersonalDate(selectedDate, 1))}><ChevronRight size={18} aria-hidden="true" /></CovieIconButton></div>} />
            {data ? selectedItems.length ? visibleStates.map((state) => <StateRecords key={state} state={state} items={selectedItems} sources={sourceMap} timezone={timezone} />) : <CovieEmptyState title="Room in your day" description="No personal commitments or care context from the selected calendars on this day." /> : <p className={styles.help}>{loading ? "Your day is loading." : "Refresh to see this day’s items."}</p>}
          </section>
        </> : <section className={styles.agenda} aria-label="Monthly agenda">
          <CovieSectionHeader title={`${personalMonthLabel(month)} agenda`} description="Your confirmed plans, tentative plans and care context, day by day." />
          {data ? agendaDays.length ? agendaDays.map((day) => <section key={day} className={styles.agendaDay} aria-label={personalDateLabel(day, true)}><button type="button" className={styles.agendaDate} onClick={() => { selectDate(day); setView("month"); }}>{personalDateLabel(day)}<ArrowUpRight size={16} aria-hidden="true" /><span className="sr-only">Open day</span></button><div className={styles.agendaRecords}>{visibleStates.map((state) => <StateRecords key={state} state={state} items={itemsByDay.get(day)!} sources={sourceMap} timezone={timezone} />)}</div></section>) : <CovieEmptyState title="No plans in this month" description="Your own confirmed commitments, tentative plans and care context will appear here when they’re added in a source calendar." /> : <p className={styles.help}>{loading ? "Your agenda is loading." : "Refresh to see your agenda."}</p>}
        </section>}
      </section>

      <section className={styles.attention} aria-label="Needs your attention" aria-busy={loading}>
        <CovieSectionHeader title="Needs your attention" description="Outstanding tasks and shared costs through this month, all waiting approvals, and upcoming events you organise this month. These aren’t booked time." />
        {data ? data.attention.length ? <div className={styles.attentionRecords}>{data.attention.map((item) => sourceMap.has(item.calendarId) ? <PersonalRecord key={item.id} item={item} source={sourceMap.get(item.calendarId)!} timezone={timezone} /> : null)}</div> : <p className={styles.help}>No outstanding tasks or shared costs through this month, waiting approvals, or upcoming events to organise in the selected calendars.</p> : <p className={styles.help}>{loading ? "Checking items that need attention…" : "Refresh to check items that need attention."}</p>}
      </section>
    </>}
  </CoviePage>;
}
