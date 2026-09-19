type CalendarEventItem = {
  id: string;
  title: string;
  startDate: string;
};

type HandoverItem = {
  id: string;
  title: string;
  date: string;
};

export function comingUp(
  events: CalendarEventItem[],
  handovers: HandoverItem[],
  today: string,
) {
  const rows = [
    ...events
      .filter((item) => item.startDate >= today)
      .map((item) => ({
        id: item.id,
        title: item.title,
        date: item.startDate,
        kind: "Event" as const,
        href: `/calendar?date=${encodeURIComponent(item.startDate)}`,
      })),
    ...handovers
      .filter((item) => item.date >= today)
      .map((item) => ({
        id: item.id,
        title: item.title,
        date: item.date,
        kind: "Handover" as const,
        href: `/calendar?date=${encodeURIComponent(item.date)}`,
      })),
  ].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.kind === b.kind ? a.title.localeCompare(b.title) : a.kind.localeCompare(b.kind)),
  );

  return {
    items: rows.slice(0, 6),
    total: rows.length,
  };
}
