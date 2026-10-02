import { createRoot } from "react-dom/client";
import { PersonalCalendar } from "../../../components/personal/personal-calendar";
import type { PersonalData } from "../../../lib/personal/contracts";
const data: PersonalData = { month: "2026-10", timezone: "UTC", today: "2026-10-02", sources: [{ id: "calendar-1", name: "Community courts", type: "shared_facilities", timezone: "UTC" }], items: [], attention: [], warnings: [] };
const realFetch = window.fetch;
window.fetch = (input, init) => String(input).startsWith("/api/personal") ? Promise.resolve(new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } })) : realFetch(input, init);
createRoot(document.getElementById("root")!).render(<PersonalCalendar initialData={data} />);
