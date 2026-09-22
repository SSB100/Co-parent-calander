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
  if (category === "sport") return "bg-[#BFEDE6] text-[#243139]";
  if (category === "medical") return "bg-[#FFD0CB] text-[#243139]";
  if (category === "birthday") return "bg-[#F7DC86] text-[#243139]";
  if (category === "holiday") return "bg-[#C3DCF7] text-[#243139]";
  if (category === "activity") return "bg-[#D7F2EC] text-[#243139]";
  if (category === "handover") return "bg-[#19A897] text-[#243139]";
  return "bg-[#E6DBCF] text-[#243139]";
}

export function eventCategorySurfaceClass(category: string) {
  if (category === "school") return "border-[#C9BDF1] bg-[#F4F1FF]";
  if (category === "sport") return "border-[#9FD7CE] bg-[#EAF8F5]";
  if (category === "medical") return "border-[#FFB5AE] bg-[#FFF3F1]";
  if (category === "birthday") return "border-[#E8C969] bg-[#FFF9DF]";
  if (category === "holiday") return "border-[#9FC7EF] bg-[#EEF5FC]";
  if (category === "activity") return "border-[#B8E5DB] bg-[#F0FBF8]";
  if (category === "handover") return "border-[#19A897] bg-[#D7F2EC]";
  return "border-[#D8CEC3] bg-[#F7EFE5]";
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
