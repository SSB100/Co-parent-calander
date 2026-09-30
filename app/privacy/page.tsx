import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell } from "@/components/marketing/legal-page-shell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Covie collects, uses, protects and shares personal information.",
};

export default function PrivacyPage() {
  return (
    <LegalPageShell
      eyebrow="Your information"
      title="Privacy Policy"
      intro="Covie helps people organise work, services, groups and family plans. This policy explains what we collect, why we need it and the choices available to you."
    >
      <p className="covie-legal-updated">Effective 1 October 2026</p>

      <h2>1. What this policy covers</h2>
      <p>
        This policy explains how Covie handles personal information when you
        use the website, create an account, join a shared calendar, book an appointment, contact us
        or use an optional integration.
      </p>

      <h2>2. Information Covie may hold</h2>
      <p>Depending on the features you use, Covie may hold:</p>
      <ul>
        <li>your name, email address and account identifiers;</li>
        <li>calendar membership and permission information;</li>
        <li>parenting schedules, family events, tasks and shared costs;</li>
        <li>staff profiles, published shifts, attendance records, timesheet corrections and leave requests;</li>
        <li>facilities and resource bookings, group events, RSVPs and availability you choose to share;</li>
        <li>salon services, practitioner profiles and working hours, appointment details, client names and optional contact details, and internal appointment notes entered by authorised salon staff;</li>
        <li>
          information about children that a parent chooses to add, which can
          include school, activity, health or practical information;
        </li>
        <li>approval requests and the status of shared changes;</li>
        <li>documents or profile photos you choose to upload;</li>
        <li>
          security and session information needed to protect accounts and
          operate the service;
        </li>
        <li>
          encrypted credentials required for optional integrations such as
          Google Calendar; and
        </li>
        <li>
          information you provide through the FAQ/Contact page, including your
          name, email address, contact reason and message.
        </li>
      </ul>
      <p>
        Covie does not store your account password as readable plain text.
        Password authentication is handled by Covie’s managed authentication
        provider.
      </p>

      <h2>3. Why we use personal information</h2>
      <p>We use personal information where reasonably necessary to:</p>
      <ul>
        <li>create and secure accounts;</li>
        <li>show the correct shared calendar to authorised members;</li>
        <li>provide scheduling, costs, tasks, approvals and child profiles;</li>
        <li>provide staff scheduling, resource and appointment bookings, group events and availability;</li>
        <li>show your own relevant commitments in your private Personal overview;</li>
        <li>show a salon’s chosen business details, offered services, practitioner profiles and available times on a client booking page when the owner enables it;</li>
        <li>send account, approval or service-related notifications;</li>
        <li>provide integrations that you choose to connect;</li>
        <li>respond to support, privacy and feature requests;</li>
        <li>detect misuse, troubleshoot problems and protect Covie; and</li>
        <li>meet legal obligations that apply to us.</li>
      </ul>

      <h2>4. Where information comes from</h2>
      <p>
        Most information comes directly from you, from an authorised member of a
        calendar, or from the business, practitioner or client involved in a booking. Some technical information is
        generated automatically when Covie authenticates a session or processes
        a request.
      </p>

      <h2>5. Who can see information</h2>
      <p>
        Shared calendar workspaces are available to accounts with membership of
        that calendar, subject to the permissions for that calendar type. Joining
        one calendar does not give someone access to another calendar.
        Co-parenting information may be visible to the other authorised parent
        or viewer in that family calendar.
      </p>
      <p>
        Staff Rosters separates manager tools from a staff member’s own schedule,
        attendance and requests. Shared Facilities shows members resource
        availability and their own bookings; an owner can choose how much of other
        members’ booking information is shared. Private booking notes are limited
        to the booking member and authorised organisers. Social Groups shares
        group events, RSVPs and the availability members choose to add with the
        group’s members.
      </p>
      <p>
        Salon client booking pages start disabled. A salon owner can enable a
        separate client booking page. That page shows
        the business details, offered services and prices, enabled practitioner
        profiles and available appointment times selected for publication. It
        does not show other clients’ bookings, contact details, private notes or
        unrelated calendars.
      </p>
      <p>
        Salon owners and managers can manage business appointments. Practitioners
        can access appointments assigned to them and the client details needed to
        manage those appointments. Signed-in clients can access their own
        appointment details without joining the salon’s shared workspace.
        Internal salon notes are not included in the client view.
      </p>
      <p>
        Personal is a private overview for your account. It reads relevant items
        you can already access and links to their original records. It does not
        publish your other commitments to employers, businesses, groups, clients
        or co-parents, or automatically use them to block salon availability.
      </p>

      <h2>6. Service providers</h2>
      <p>
        We use specialist providers to operate Covie. These may include hosting,
        database and authentication providers, private file storage, email
        delivery and optional services such as Google Calendar.
      </p>
      <p>
        Providers are given only the access reasonably needed to deliver their
        part of the service. They may process information outside New Zealand.
        Where cross-border processing occurs, we take reasonable steps to use
        providers and arrangements that support appropriate privacy and
        security protections.
      </p>
      <p>
        Covie does not sell personal information to advertisers.
      </p>

      <h2>7. Optional Google Calendar connection</h2>
      <p>
        If you connect Google Calendar, Covie requests a limited permission
        intended to manage the calendar created by Covie. Connection
        credentials are encrypted before they are stored by Covie. You can
        disconnect the integration from Covie.
      </p>

      <p>
        The current Google Calendar connection is optional, one-way output for
        co-parenting calendars; Covie remains the source of truth.
      </p>

      <h2>8. Files and documents</h2>
      <p>
        Uploaded files are kept in private object storage rather than being
        published at permanent public URLs. Covie creates short-lived,
        authorised links when a permitted user uploads or downloads a file.
      </p>

      <h2>9. Security</h2>
      <p>
        We use reasonable technical and organisational safeguards designed to
        protect personal information from loss, unauthorised access, misuse,
        modification and disclosure. These include authenticated access,
        server-side permissions, encrypted network connections, private file
        storage and restricted application secrets.
      </p>
      <p>
        No online service can promise absolute security. If you believe your
        account or information has been exposed, contact us promptly through
        the <Link href="/help#contact">Help page</Link>.
      </p>

      <h2>10. Retention and deletion</h2>
      <p>
        We aim to keep personal information only for as long as it is reasonably
        needed to operate Covie, maintain security and history that users rely
        on, meet legal requirements, or resolve a problem.
      </p>
      <p>
        Some records may remain for a limited period in backups, audit history
        or system logs after they stop appearing in the live service. We avoid
        copying sensitive child-profile values into audit history where a record
        of which field changed is sufficient.
      </p>

      <p>
        Cancelling a Facilities booking, Social event or Salon appointment retains
        its history. Changing or filtering the Personal overview does not cancel
        or delete the original item. Personal’s displayed commitments follow the
        current source record and your current access.
      </p>

      <h2>11. Access and correction</h2>
      <p>
        New Zealand privacy law gives people rights to ask for access to personal
        information about themselves and to request correction where it is
        inaccurate. Use the <Link href="/help#contact">contact form</Link> and
        choose the privacy or security option. We may need to confirm your
        identity before responding.
      </p>

      <h2>12. Information about children</h2>
      <p>
        Covie accounts are for adults, including parents and caregivers organising
        family information. Parents and
        caregivers should only add child information that is genuinely useful
        for co-parenting and that they are entitled to provide. Extra care
        should be taken with medical, school and identity information.
      </p>

      <h2>13. Cookies and sessions</h2>
      <p>
        Covie uses essential authentication and preference cookies to keep you
        signed in securely and remember the calendar you selected. These are
        used to provide the service rather than for behavioural advertising.
      </p>

      <h2>14. Privacy incidents</h2>
      <p>
        If a privacy breach occurs, we will assess it and take appropriate
        steps. Where New Zealand law requires notification to affected people
        or the Office of the Privacy Commissioner, we will follow those
        requirements.
      </p>

      <h2>15. Changes to this policy</h2>
      <p>
        We may update this policy when Covie changes or privacy requirements
        evolve. The current version and effective date will be published on this
        page, and material changes will be made reasonably clear.
      </p>

      <h2>16. Contact</h2>
      <p>
        Privacy questions, access requests and correction requests can be sent
        through the <Link href="/help#contact">Covie contact form</Link>.
      </p>
    </LegalPageShell>
  );
}
