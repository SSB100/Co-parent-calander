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


export type AssignmentProposalRow = {
  childId: string;
  date: string;
  morningParentId: string | null;
  afternoonParentId: string | null;
  handoverTime: string | null;
  handoverLocation: string | null;
  note: string | null;
};

export function assignmentProposalRowsEqual(
  before: AssignmentProposalRow[],
  after: AssignmentProposalRow[],
) {
  if (before.length !== after.length) return false;

  const afterByKey = new Map(
    after.map((assignment) => [
      `${assignment.childId}:${assignment.date}`,
      assignment,
    ]),
  );

  return before.every((assignment) => {
    const proposed = afterByKey.get(
      `${assignment.childId}:${assignment.date}`,
    );
    return (
      proposed !== undefined &&
      assignment.morningParentId === proposed.morningParentId &&
      assignment.afternoonParentId === proposed.afternoonParentId &&
      assignment.handoverTime === proposed.handoverTime &&
      assignment.handoverLocation === proposed.handoverLocation &&
      assignment.note === proposed.note
    );
  });
}
