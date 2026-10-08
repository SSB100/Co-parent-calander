"use client";
import { useState } from "react";
import { CovieButton, CovieDialog, CovieNotice } from "@/components/ui/covie";
import type { SalonData } from "@/lib/salon/contracts";
import { salonPrice } from "./salon-ui";
import styles from "./salon.module.css";

/** Private, local draft of saved display settings. Never calls the public API while disabled. */
export function SalonBookingSharing({ data, disabled }: { data: SalonData; disabled: boolean }) {
  const [preview, setPreview] = useState(false);
  const [copyState, setCopyState] = useState("");
  const path = `/booking/${encodeURIComponent(data.calendarId)}`;
  const profiles = data.practitioners.filter(person => person.active && person.bookable);
  const services = data.services.filter(service => service.active && service.bookable && profiles.some(person => person.serviceIds.includes(service.id)));
  const shownProfiles = profiles.filter(person => person.serviceIds.some(id => services.some(service => service.id === id)));
  if (data.role !== "owner") return null;
  return <section className={styles.stack} aria-label="Client booking page sharing">
    <p className={styles.help}>{data.settings.publicEnabled ? "Client booking page enabled." : "Client booking page is private."} Clients sign in to Covie before confirming a booking. Use an external “Book now” link on your website.</p>
    <div className={styles.actions}>
      <CovieButton tone="neutral" disabled={disabled} onClick={() => setPreview(true)}>Preview saved booking details</CovieButton>
      {data.settings.publicEnabled ? <>
        <CovieButton tone="neutral" disabled={disabled} onClick={async () => { try { await navigator.clipboard.writeText(new URL(path, window.location.origin).href); setCopyState("Booking link copied."); } catch { setCopyState("Could not copy. Open the client page and copy its address."); } }}>Copy booking link</CovieButton>
        <a className="covie-button covie-action-secondary" href={path} target="_blank" rel="noopener noreferrer">Open client page</a>
      </> : null}
    </div>
    {copyState ? <p role="status">{copyState}</p> : null}
    {preview && !disabled ? <CovieDialog id="salon-owner-booking-preview" title="Saved booking details preview" onClose={() => setPreview(false)}>
      <div className={styles.stack}>
        <CovieNotice>This private draft shows saved display settings only. Current membership and real available times are checked again by the booking service. This preview does not enable booking or create an appointment.</CovieNotice>
        <h3>{data.settings.businessName}</h3>
        {data.settings.description ? <p>{data.settings.description}</p> : null}
        {data.settings.location ? <p>{data.settings.location}</p> : null}
        <p>Times use {data.timezone}. Clients sign in before booking. Change or cancel at least {data.settings.cancellationHours} hours before the appointment.</p>
        <h4>Services marked for online booking</h4>
        {services.length ? <ul>{services.map(service => <li key={service.id}><strong>{service.name}</strong> · {service.durationMinutes} minutes · {salonPrice(service.priceMinor, service.currency)}{service.description ? <p>{service.description}</p> : null}</li>)}</ul> : <p>No active online service has an assigned online practitioner yet.</p>}
        <h4>Practitioners marked for online booking</h4>
        {shownProfiles.length ? <ul>{shownProfiles.map(person => <li key={person.id}><strong>{person.displayName}</strong>{person.bio ? <p>{person.bio}</p> : null}</li>)}</ul> : <p>No practitioners are configured for these services yet.</p>}
        <CovieButton tone="neutral" onClick={() => setPreview(false)}>Close preview</CovieButton>
      </div>
    </CovieDialog> : null}
  </section>;
}
