export const parentProfileSlots = [
  "parent_one",
  "parent_two",
] as const;

export type ParentProfileSlot =
  (typeof parentProfileSlots)[number];

export function nextAvailableParentProfileSlot(
  existing: Array<ParentProfileSlot | null | undefined>,
): ParentProfileSlot | null {
  if (!existing.includes("parent_one")) return "parent_one";
  if (!existing.includes("parent_two")) return "parent_two";
  return null;
}

export function defaultParentColorKey(
  slot: ParentProfileSlot,
) {
  return slot === "parent_one" ? "emerald" : "violet";
}

export function parentProfileSlotIndex(
  slot: ParentProfileSlot | null | undefined,
  fallbackIndex = 0,
) {
  if (slot === "parent_one") return 0;
  if (slot === "parent_two") return 1;
  return Math.max(0, fallbackIndex);
}
