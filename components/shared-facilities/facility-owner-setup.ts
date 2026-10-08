import type { OwnerSetupStep } from "@/components/onboarding/owner-setup-readiness";
import type { FacilityData } from "@/lib/shared-facilities/contracts";

/** Default rules do not prove an owner reviewed or saved them. */
export function facilityOwnerSetup(data: FacilityData): {
  steps: OwnerSetupStep[];
  summary: string;
  actionLabel: string;
  nextAction: "resources" | "booking-rules";
} {
  const resourceCount = data.resources.filter(resource => resource.active).length;
  return {
    summary: resourceCount
      ? "Active resources are in place. Review booking rules and members before inviting people."
      : "Add an active resource, then review booking rules and members.",
    actionLabel: resourceCount ? "Review booking rules" : "Add a resource",
    nextAction: resourceCount ? "booking-rules" : "resources",
    steps: [
      {
        id: "resources", label: "Add an active resource", complete: resourceCount > 0,
        detail: resourceCount
          ? `${resourceCount} active ${resourceCount === 1 ? "resource" : "resources"} in this calendar. Members can book within the current rules.`
          : "No active resources yet. Add a room, shared space or piece of equipment, or restore an archived resource.",
      },
      {
        id: "rules", label: "Review booking rules", complete: false,
        detail: `Check opening hours in ${data.timezone}, booking limits and cancellation notice. ${data.rules.requireApproval ? "Member bookings require approval." : "Member bookings do not require approval."} ${data.rules.shareTitles ? "Booking titles are shared with members." : "Other members see occupied times without booking titles."} This review is not tracked.`,
      },
      {
        id: "members", label: "Review members and roles", complete: false,
        detail: "Open Members to check access and resource-manager assignments before sending invitations. Membership review is not tracked here.",
      },
    ],
  };
}
