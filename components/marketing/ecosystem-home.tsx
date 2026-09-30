import { ArrowDown, ArrowRight, CalendarDays, Check, Link2, UsersRound } from "lucide-react";
import Link from "next/link";
import { CovieMark } from "@/components/workspace/covie-brand";
import { CalendarPurposePicker } from "./calendar-purpose-picker";
import { calendarPurposes, googleCalendarNote } from "./calendar-purpose-content";
import { PublicFooter, PublicHeader } from "./public-chrome";
import styles from "./ecosystem-home.module.css";

const steps = [
  { number: "01", title: "Start with your purpose", description: "Create an account, then choose the calendar that fits the plan you are making." },
  { number: "02", title: "Bring your people in", description: "Invite the people who belong in that calendar. Organisers and members share the same plan, with access suited to their role." },
  { number: "03", title: "Keep the next step clear", description: "Add the dates and details that matter. If another calendar would help, add it to the same account." },
];

export function EcosystemHome() {
  return (
    <div className={styles.page}>
      <a href="#main-content" className={styles.skipLink}>Skip to content</a>
      <PublicHeader />
      <main id="main-content">
        <section className={styles.hero} aria-labelledby="home-title">
          <div className={`${styles.container} ${styles.heroGrid}`}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}><span className={styles.eyebrowDot} />Make room for the shared plan</p>
              <h1 id="home-title" className={styles.heroTitle}>Purpose-built calendars.<br />One shared place.</h1>
              <p className={styles.heroDescription}>Team shifts. Client appointments. Shared spaces. Time together. Parenting days. Start with the calendar you need. Add another when it helps.</p>
              <div className={styles.heroActions}>
                <Link href="/auth/sign-up" className={styles.primaryAction}>Create your calendar<ArrowRight size={18} aria-hidden="true" /></Link>
                <a href="#calendar-types" className={styles.secondaryAction}>Find your calendar<ArrowDown size={17} aria-hidden="true" /></a>
              </div>
              <p className={styles.heroNote}>Already part of a calendar? <Link href="/auth/sign-in">Log in</Link> to join your people.</p>
            </div>
            <div className={styles.ecosystemVisual}>
              <div className={styles.visualTop}><CovieMark size={40} /><span>Different parts of life.<br /><strong>One familiar place.</strong></span></div>
              <div className={styles.calendarStack}>
                {calendarPurposes.map((purpose, index) => (
                  <div className={styles.calendarRow} key={purpose.id}>
                    <span className={styles.calendarNumber} style={{ backgroundColor: purpose.primary, color: purpose.primaryText }}>0{index + 1}</span>
                    <div><strong>{purpose.name}</strong><span>{purpose.audience.replace(/^For /, "")}</span></div>
                    <span className={styles.calendarPair} style={{ backgroundColor: purpose.secondary }} aria-hidden="true" />
                  </div>
                ))}
              </div>
              <div className={styles.visualBottom}><UsersRound size={16} aria-hidden="true" /><span>Your calendars, each with their own people</span></div>
            </div>
          </div>
        </section>

        <section id="calendar-types" className={styles.typesSection} aria-labelledby="types-title">
          <div className={styles.container}>
            <div className={styles.sectionHeading}>
              <div><p className={styles.eyebrow}>Find your fit</p><h2 id="types-title">What are you planning together?</h2></div>
              <p>Choose the shared calendars you need. Personal brings your own commitments together in a private overview.</p>
            </div>
            <CalendarPurposePicker />
          </div>
        </section>

        <section id="how-it-works" className={styles.howSection} aria-labelledby="how-title">
          <div className={styles.container}>
            <div className={styles.sectionHeading}>
              <div><p className={styles.eyebrow}>Shared starts here</p><h2 id="how-title">A little setup.<br />A clearer plan.</h2></div>
              <p>Keep work, shared spaces, community and family calendars separate. Bring the right people into each one.</p>
            </div>
            <ol className={styles.steps}>
              {steps.map((step) => <li key={step.number}><span className={styles.stepNumber}>{step.number}</span><h3>{step.title}</h3><p>{step.description}</p></li>)}
            </ol>
          </div>
        </section>

        <section id="features" className={styles.sharedSection} aria-labelledby="shared-title">
          <div className={`${styles.container} ${styles.sharedGrid}`}>
            <div><p className={styles.eyebrow}>Built around people</p><h2 id="shared-title">The right details.<br />The right people.</h2><p className={styles.bodyCopy}>A team needs shifts. A salon needs appointments. A shared space needs bookings. A group needs get-togethers. Co-parents need handovers. Covie gives each plan a calendar with its own purpose, while keeping the experience familiar.</p></div>
            <div className={styles.sharedPrinciples}>
              <div><UsersRound size={22} aria-hidden="true" /><h3>Share calendar by calendar</h3><p>Membership belongs to each calendar. The people in one plan do not automatically become part of another.</p></div>
              <div><CalendarDays size={22} aria-hidden="true" /><h3>Your own commitments, together</h3><p>Personal brings together your shifts, bookings, plans and care commitments. Open any item in its source calendar when you need to act.</p></div>
              <div><Link2 size={22} aria-hidden="true" /><h3>Keep Covie as your source of truth</h3><p>{googleCalendarNote}</p></div>
            </div>
          </div>
        </section>

        <section className={styles.finalSection} aria-labelledby="start-title">
          <div className={`${styles.container} ${styles.finalGrid}`}>
            <div><p className={styles.eyebrow}><Check size={16} aria-hidden="true" />Start with one plan</p><h2 id="start-title">Make a little more room<br />for life together.</h2><p>Create your account, choose your calendar and take it from there.</p></div>
            <Link href="/auth/sign-up" className={styles.primaryAction}>Get started with Covie<ArrowRight size={18} aria-hidden="true" /></Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
