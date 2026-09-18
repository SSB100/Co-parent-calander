import { CalendarDays, GraduationCap, Dumbbell, Cake, MapPin, Clock3, CalendarCheck } from "lucide-react";
const icons = { school: GraduationCap, sport: Dumbbell, birthday: Cake, holiday: MapPin, medical: CalendarCheck, activity: Clock3 };
export function EventCategoryIcon({ category }: { category: string }) {
  const Icon = icons[category as keyof typeof icons] ?? CalendarDays;
  return <Icon className="inline-block h-4 w-4 shrink-0 align-text-bottom" aria-hidden="true" />;
}
