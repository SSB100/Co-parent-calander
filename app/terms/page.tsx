import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell } from "@/components/marketing/legal-page-shell";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "The terms for using Covie, the shared co-parenting organiser.",
};

export default function TermsPage() {
  return (
    <LegalPageShell
      eyebrow="The ground rules"
      title="Terms & Conditions"
      intro="These terms explain what Covie is for, what we ask from you, and the limits of the service. They are written for everyday use rather than legal fine print."
    >
      <p className="covie-legal-updated">Effective 21 September 2026</p>

      <h2>1. About these terms</h2>
      <p>
        These Terms & Conditions apply when you create an account or use Covie.
        “Covie”, “we”, “us” and “our” refer to the Covie service. By creating an
        account, you agree to these terms and our{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>2. What Covie is</h2>
      <p>
        Covie is a shared co-parenting organiser for schedules, family events,
        shared costs, practical tasks, child information and agreed changes. It
        is designed for cooperative planning and everyday coordination.
      </p>
      <p>
        Covie is not a law firm, legal evidence service, emergency service,
        medical service, counselling service or substitute for professional
        advice. Information in Covie does not determine legal parenting rights
        or override a court order, parenting agreement or applicable law.
      </p>

      <h2>3. Who may use Covie</h2>
      <p>
        You must be at least 18 years old to create an account. You must only
        add information about a child or another person where you have a lawful
        reason and appropriate authority to do so.
      </p>

      <h2>4. Your account</h2>
      <p>
        You are responsible for keeping your login details secure and for
        activity carried out through your account. Tell us through the{" "}
        <Link href="/help#contact">contact page</Link> if you believe your
        account has been accessed without permission.
      </p>
      <p>
        Account details should be accurate and kept reasonably up to date. You
        must not impersonate another person, attempt to access another family’s
        information, or share credentials in a way that undermines account
        security.
      </p>

      <h2>5. Shared calendars and invitations</h2>
      <p>
        A Covie calendar may contain information visible to the other members of
        that calendar. If you invite another person, you are responsible for
        making sure the invitation is sent to the intended person.
      </p>
      <p>
        Some shared changes may require another member’s approval. Covie records
        the status of those proposals, but it does not decide what either parent
        should agree to.
      </p>

      <h2>6. Content you add</h2>
      <p>
        You keep ownership of the information and files you add to Covie. You
        give us permission to host, process, display and transmit that content
        only as reasonably necessary to operate, secure and improve the service
        and to provide features you choose to use.
      </p>
      <p>
        Do not upload unlawful, harmful or malicious material, content that
        infringes another person’s rights, or files designed to damage or
        interfere with Covie or another system.
      </p>

      <h2>7. Privacy</h2>
      <p>
        We handle personal information in accordance with our{" "}
        <Link href="/privacy">Privacy Policy</Link> and applicable New Zealand
        privacy law. Covie may contain sensitive information about children, so
        users should only add what is genuinely useful for co-parenting.
      </p>

      <h2>8. Third-party services</h2>
      <p>
        Covie relies on specialist service providers for hosting,
        authentication, databases, private file storage and email delivery.
        Optional integrations, such as Google Calendar, are only used when you
        choose to connect them.
      </p>
      <p>
        Third-party services can occasionally be unavailable or change their
        own systems. We will take reasonable steps to keep Covie working, but we
        cannot guarantee uninterrupted access to systems outside our control.
      </p>

      <h2>9. Availability and changes to Covie</h2>
      <p>
        We may maintain, improve, add to or retire parts of Covie. We will try
        to avoid unnecessary disruption and will give reasonable notice where a
        material change affects how the service is used.
      </p>
      <p>
        We may temporarily restrict access where reasonably necessary for
        security, maintenance, suspected misuse or to protect users and the
        service.
      </p>

      <h2>10. Consumer rights</h2>
      <p>
        Nothing in these terms excludes or limits rights you have under New
        Zealand law that cannot legally be excluded, including rights that may
        apply under the Consumer Guarantees Act 1993 and Fair Trading Act 1986.
      </p>

      <h2>11. Responsibility when things go wrong</h2>
      <p>
        To the extent permitted by law, Covie is not responsible for decisions
        made by users or co-parents, inaccurate information entered by users,
        disputes between family members, or losses caused solely by third-party
        outages or events beyond our reasonable control.
      </p>
      <p>
        We do not use these terms to avoid responsibility where New Zealand law
        says responsibility cannot be excluded or limited.
      </p>

      <h2>12. Ending your use of Covie</h2>
      <p>
        You may stop using Covie at any time. We may suspend or close an account
        where there is serious or repeated misuse, a security threat, unlawful
        activity, or another material breach of these terms. Where practical,
        we will explain the reason.
      </p>

      <h2>13. Changes to these terms</h2>
      <p>
        We may update these terms as Covie changes or legal requirements evolve.
        The current version and effective date will always be published here.
        If a change is material, we will take reasonable steps to make it clear
        before or when it takes effect.
      </p>

      <h2>14. New Zealand law</h2>
      <p>
        These terms are governed by New Zealand law. Any rights you have under
        applicable consumer or privacy legislation continue to apply.
      </p>

      <h2>15. Questions</h2>
      <p>
        If you have a question about these terms, use the{" "}
        <Link href="/help#contact">Covie contact form</Link>.
      </p>
    </LegalPageShell>
  );
}
