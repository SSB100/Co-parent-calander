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


export const parentColorKeys = [
  "emerald",
  "violet",
  "coral",
  "sunshine",
  "sky",
] as const;

export type ParentColorKey = (typeof parentColorKeys)[number];

export const parentColorOptions: ReadonlyArray<{
  key: ParentColorKey;
  label: string;
  swatch: string;
  soft: string;
}> = [
  { key: "emerald", label: "Teal", swatch: "#19A897", soft: "#BDEBE5" },
  { key: "violet", label: "Violet", swatch: "#765ED6", soft: "#E1D8FA" },
  { key: "coral", label: "Coral", swatch: "#FF6B5F", soft: "#FFD7D3" },
  { key: "sunshine", label: "Sunshine", swatch: "#D9A918", soft: "#FCEBB3" },
  { key: "sky", label: "Sky", swatch: "#3B82B8", soft: "#D4EAF7" },
];

export function parentColorOption(colorKey: string | null | undefined) {
  return parentColorOptions.find((option) => option.key === colorKey) ?? parentColorOptions[0];
}

export function parentColorHex(colorKey: string | null | undefined) {
  return parentColorOption(colorKey).swatch;
}
