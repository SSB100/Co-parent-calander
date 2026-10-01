import Link from "next/link";
import { CovieBrand } from "./covie-brand";
import styles from "./calendar-identity.module.css";

/** The same brand anchor above every standalone or mobile calendar. */
export function CalendarIdentity({ mobileOnly = false }: { mobileOnly?: boolean }) {
  return <div className={`${styles.identity} ${mobileOnly ? styles.mobileOnly : ""}`}>
    <Link href="/personal" prefetch={false} aria-label="Covie Personal"><CovieBrand /></Link>
  </div>;
}
