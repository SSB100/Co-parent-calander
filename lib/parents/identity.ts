export const parentProfileSlots = [
  "parent_one",
  "parent_two",
] as const;

export type ParentProfileSlot =
  (typeof parentProfileSlots)[number];

export const parentColorKeys = [
  "teal",
  "violet",
  "coral",
  "sunshine",
  "blue",
] as const;

export type ParentColorKey = (typeof parentColorKeys)[number];

export const parentColorOptions = [
  {
    key: "teal",
    label: "Teal",
    hex: "#BFEDE6",
    dotClass: "bg-[#19A897]",
    slotClass: "bg-[#BFEDE6]",
    pillClass: "bg-[#BFEDE6] text-[#16443F]",
    buttonClass: "bg-[#BFEDE6] text-[#243139] hover:bg-[#A9E4DB]",
  },
  {
    key: "violet",
    label: "Violet",
    hex: "#DDD3FA",
    dotClass: "bg-[#765ED6]",
    slotClass: "bg-[#DDD3FA]",
    pillClass: "bg-[#DDD3FA] text-[#403274]",
    buttonClass: "bg-[#DDD3FA] text-[#243139] hover:bg-[#CEC1F6]",
  },
  {
    key: "coral",
    label: "Coral",
    hex: "#FFD0CB",
    dotClass: "bg-[#FF6B5F]",
    slotClass: "bg-[#FFD0CB]",
    pillClass: "bg-[#FFD0CB] text-[#6E2C27]",
    buttonClass: "bg-[#FFD0CB] text-[#243139] hover:bg-[#FFC0B9]",
  },
  {
    key: "sunshine",
    label: "Sunshine",
    hex: "#F7DC86",
    dotClass: "bg-[#F4C64E]",
    slotClass: "bg-[#F7DC86]",
    pillClass: "bg-[#F7DC86] text-[#59440A]",
    buttonClass: "bg-[#F7DC86] text-[#243139] hover:bg-[#F2D16B]",
  },
  {
    key: "blue",
    label: "Blue",
    hex: "#CFE2F9",
    dotClass: "bg-[#4D89C7]",
    slotClass: "bg-[#CFE2F9]",
    pillClass: "bg-[#CFE2F9] text-[#244A72]",
    buttonClass: "bg-[#CFE2F9] text-[#243139] hover:bg-[#BBD6F5]",
  },
] as const;

export function nextAvailableParentProfileSlot(
  existing: Array<ParentProfileSlot | null | undefined>,
): ParentProfileSlot | null {
  if (!existing.includes("parent_one")) return "parent_one";
  if (!existing.includes("parent_two")) return "parent_two";
  return null;
}

export function defaultParentColorKey(
  slot: ParentProfileSlot,
): ParentColorKey {
  return slot === "parent_one" ? "teal" : "violet";
}

export function normalizeParentColorKey(
  value: string | null | undefined,
  fallbackIndex = 0,
): ParentColorKey {
  if (value === "emerald") return "teal";
  if ((parentColorKeys as readonly string[]).includes(value ?? "")) {
    return value as ParentColorKey;
  }
  return fallbackIndex % 2 === 0 ? "teal" : "violet";
}

export function parentProfileSlotIndex(
  slot: ParentProfileSlot | null | undefined,
  fallbackIndex = 0,
) {
  if (slot === "parent_one") return 0;
  if (slot === "parent_two") return 1;
  return Math.max(0, fallbackIndex);
}
