import {
  CalendarCheck,
  CalendarDays,
  Cake,
  Clock3,
  Dumbbell,
  GraduationCap,
  MapPin,
} from "lucide-react";

const icons = {
  school: GraduationCap,
  sport: Dumbbell,
  birthday: Cake,
  holiday: MapPin,
  medical: CalendarCheck,
  activity: Clock3,
};

export function eventCategoryBarClass(category: string) {
  if (category === "school") return "bg-[#765ED6] text-white";
  if (category === "sport") return "bg-[#19A897] text-[#243139]";
  if (category === "medical") return "bg-[#FF6B5F] text-[#243139]";
  if (category === "birthday") return "bg-[#F4C64E] text-[#243139]";
  if (category === "holiday") return "bg-[#3B73AE] text-white";
  if (category === "activity") return "bg-[#0D7A6D] text-white";
  if (category === "handover") return "bg-[#243139] text-white";
  return "bg-[#66747A] text-white";
}

export function eventCategorySurfaceClass(category: string) {
  if (category === "school") return "border-[#6651B7] bg-[#765ED6] text-white";
  if (category === "sport") return "border-[#128B7D] bg-[#19A897] text-[#243139]";
  if (category === "medical") return "border-[#D94D43] bg-[#FF6B5F] text-[#243139]";
  if (category === "birthday") return "border-[#9C7310] bg-[#F4C64E] text-[#243139]";
  if (category === "holiday") return "border-[#315F91] bg-[#3B73AE] text-white";
  if (category === "activity") return "border-[#0B665C] bg-[#0D7A6D] text-white";
  if (category === "handover") return "border-[#243139] bg-[#243139] text-white";
  return "border-[#526168] bg-[#66747A] text-white";
}

export function EventCategoryIcon({ category }: { category: string }) {
  const Icon = icons[category as keyof typeof icons] ?? CalendarDays;
  return (
    <Icon
      className="inline-block h-4 w-4 shrink-0 align-text-bottom"
      aria-hidden="true"
    />
  );
}
