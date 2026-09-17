export type DirectOwnership = {
  morningParentId: string | null;
  afternoonParentId: string | null;
};

export type OwnershipChoice =
  | "me_full"
  | "them_full"
  | "me_then_them"
  | "them_then_me"
  | "unassigned";

export function ownershipForChoice(
  choice: OwnershipChoice,
  meId: string,
  themId: string,
): DirectOwnership {
  if (choice === "me_full") {
    return { morningParentId: meId, afternoonParentId: meId };
  }
  if (choice === "them_full") {
    return { morningParentId: themId, afternoonParentId: themId };
  }
  if (choice === "me_then_them") {
    return { morningParentId: meId, afternoonParentId: themId };
  }
  if (choice === "them_then_me") {
    return { morningParentId: themId, afternoonParentId: meId };
  }
  return { morningParentId: null, afternoonParentId: null };
}
