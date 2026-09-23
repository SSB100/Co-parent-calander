export type StaffRosterEmailDelivery = {
  configured: boolean;
  attempted: number;
  sent: number;
  failed: number;
  skippedUnlinked: number;
  lookupFailed: boolean;
};

export function rosterPublicationFeedback(input: {
  action: "publish" | "send_updates";
  affectedMemberCount: number;
  emailDelivery: StaffRosterEmailDelivery;
}) {
  const affected = input.affectedMemberCount;
  const affectedLabel =
    affected === 1 ? "1 staff member" : affected + " staff members";

  let text =
    input.action === "publish"
      ? affected > 0
        ? "Roster published for " + affectedLabel + "."
        : "Roster published. There are no assigned shifts this week."
      : affected > 0
        ? "Roster updates published for " + affectedLabel + "."
        : "The published roster was already up to date.";

  let tone: "teal" | "sunshine" = "teal";
  const delivery = input.emailDelivery;

  if (delivery.sent > 0) {
    text +=
      " " +
      delivery.sent +
      " email notification" +
      (delivery.sent === 1 ? " was" : "s were") +
      " sent.";
  }

  if (delivery.skippedUnlinked > 0) {
    tone = "sunshine";
    text +=
      " " +
      delivery.skippedUnlinked +
      " affected staff profile" +
      (delivery.skippedUnlinked === 1 ? " is" : "s are") +
      " not linked to a Covie account yet, so no email was sent to " +
      (delivery.skippedUnlinked === 1 ? "that profile." : "those profiles.");
  }

  if (delivery.lookupFailed) {
    tone = "sunshine";
    text +=
      " Email recipients could not be checked. The roster is still published in Covie.";
  } else if (!delivery.configured && affected > delivery.skippedUnlinked) {
    tone = "sunshine";
    text +=
      " Email notifications are not configured. The roster is still published in Covie.";
  }

  if (delivery.failed > 0) {
    tone = "sunshine";
    text +=
      " " +
      delivery.failed +
      " email notification" +
      (delivery.failed === 1 ? " could" : "s could") +
      " not be delivered. The roster is still published in Covie.";
  }

  return { tone, text };
}
