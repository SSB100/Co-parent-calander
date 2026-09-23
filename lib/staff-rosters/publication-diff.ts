export type ComparableRosterShift = {
  id: string;
  memberId: string;
  roleId: string | null;
  locationId: string | null;
  date: string;
  startTime: string;
  endTime: string;
  note: string | null;
  availabilityOverride: boolean;
  sourceShiftId?: string | null;
};

export function rosterShiftComparisonKey(input: ComparableRosterShift) {
  return JSON.stringify([
    input.memberId,
    input.roleId,
    input.locationId,
    input.date,
    input.startTime.slice(0, 5),
    input.endTime.slice(0, 5),
    input.note,
    input.availabilityOverride,
  ]);
}

export function rosterPublicationDiff(
  liveShifts: ComparableRosterShift[],
  publishedShifts: ComparableRosterShift[],
) {
  const memberIds = new Set<string>();
  let changedShiftCount = 0;

  const liveById = new Map(liveShifts.map((shift) => [shift.id, shift]));
  const publishedById = new Map(
    publishedShifts
      .filter((shift) => shift.sourceShiftId)
      .map((shift) => [shift.sourceShiftId as string, shift]),
  );
  const ids = new Set([...liveById.keys(), ...publishedById.keys()]);

  for (const id of ids) {
    const live = liveById.get(id);
    const published = publishedById.get(id);

    if (
      !live ||
      !published ||
      rosterShiftComparisonKey(live) !== rosterShiftComparisonKey(published)
    ) {
      if (live?.memberId) memberIds.add(live.memberId);
      if (published?.memberId) memberIds.add(published.memberId);
      changedShiftCount += 1;
    }
  }

  return {
    memberIds: [...memberIds],
    changedShiftCount,
  };
}
