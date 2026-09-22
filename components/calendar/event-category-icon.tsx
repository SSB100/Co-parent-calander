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
  if (category === "school") return "bg-[#DDD3FA] text-[#243139]";
  if (category === "sport" || category === "activity") {
    return "bg-[#BFEDE6] text-[#243139]";
  }
  if (category === "medical") return "bg-[#FFD0CB] text-[#243139]";
  if (category === "birthday" || category === "holiday") {
    return "bg-[#F7DC86] text-[#243139]";
  }
  if (category === "handover") return "bg-[#FFF9F2] text-[#243139]";
  return "bg-[#F7EFE5] text-[#243139]";
}

export function eventCategorySurfaceClass(category: string) {
  if (category === "school") return "border-[#C9BDF1] bg-[#F4F1FF]";
  if (category === "sport" || category === "activity") {
    return "border-[#9FD7CE] bg-[#EAF8F5]";
  }
  if (category === "medical") return "border-[#FFB5AE] bg-[#FFF3F1]";
  if (category === "birthday" || category === "holiday") {
    return "border-[#E8C969] bg-[#FFF9DF]";
  }
  return "border-[#E6DBCF] bg-[#FFF9F2]";
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
