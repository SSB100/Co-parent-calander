import type { OwnerSetupStep } from "@/components/onboarding/owner-setup-readiness";
import type { SocialData } from "@/lib/social-groups/contracts";

/** The snapshot is month-scoped; it cannot prove all-time setup or a saved review. */
export function socialOwnerSetup(data: SocialData): {
  steps: OwnerSetupStep[];
  summary: string;
  actionLabel: string;
  nextAction: "create-event" | "group-settings";
} {
  const eventCount = data.events.filter(event => !event.cancelled).length;
  return {
    summary: eventCount
      ? "Events are planned this month. Review event permissions and members before inviting people."
      : "Plan an event for this month, then review event permissions and members.",
    actionLabel: eventCount ? "Review group settings" : "Plan an event",
    nextAction: eventCount ? "group-settings" : "create-event",
    steps: [
      {
        id: "events", label: "Plan this month’s events", complete: eventCount > 0,
        detail: eventCount
          ? `${eventCount} active ${eventCount === 1 ? "event" : "events"} in ${data.month}. Saved events are visible to people with calendar access.`
          : `No active events in ${data.month}. Other months may have events; choose a date and add the next group activity.`,
      },
      {
        id: "settings", label: "Review event permissions", complete: false,
        detail: `${data.membersCanCreate ? "Members can create events." : "Only owners and admins can create new events."} Check this in Group settings. This review is not tracked.`,
      },
      {
        id: "members", label: "Review members and roles", complete: false,
        detail: "Open Members to check who has access and which roles they have before sending invitations. Membership review is not tracked here.",
      },
    ],
  };
}
