type Expense = { id: string; title: string; dueDate: string | null; settlementStatus: string };
type Responsibility = { id: string; title: string; dueDate: string; completedAt: string | Date | null };
export function comingUp(expenses: Expense[], responsibilities: Responsibility[], today: string) {
  const rows = [
    ...expenses.filter(x => x.settlementStatus === "outstanding" && x.dueDate).map(x => ({ id: x.id, title: x.title, date: x.dueDate!, kind: "Expense", href: `/expenses#record-${encodeURIComponent(x.id)}` })),
    ...responsibilities.filter(x => !x.completedAt).map(x => ({ id: x.id, title: x.title, date: x.dueDate, kind: "Responsibility", href: `/responsibilities#record-${encodeURIComponent(x.id)}` })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  return { items: rows.slice(0, 4).map(x => ({ ...x, overdue: x.date < today })), total: rows.length, undated: expenses.filter(x => x.settlementStatus === "outstanding" && !x.dueDate).length };
}
