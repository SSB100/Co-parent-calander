"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CovieButton,
  CovieEmptyState,
  CovieNotice,
  CoviePage,
  CoviePageHeader,
  CovieSelect,
} from "@/components/ui/covie";
import type { PublicSalonData, SalonSlot } from "@/lib/salon/contracts";
import { SalonAvailableTimes } from "./salon-available-times";
import { SalonDayPicker } from "./salon-day-picker";
import { AppointmentConfirmation } from "./appointment-confirmation";
import { useSalonMutation, useSalonResource } from "./use-salon-resource";
import { salonDateLabel, salonPrice, salonTime } from "./salon-ui";
import styles from "./salon.module.css";
import { CalendarIdentity } from "@/components/workspace/calendar-identity";
export function PublicBookingPage({
  calendarId,
  signedIn,
  defaultName = "",
  initialService = "",
  initialPractitioner = "",
  initialDate = "",
}: {
  calendarId: string;
  signedIn: boolean;
  defaultName?: string;
  initialService?: string;
  initialPractitioner?: string;
  initialDate?: string;
}) {
  const router = useRouter(),
    [date, setDate] = useState(initialDate),
    [serviceId, setService] = useState(initialService),
    [practitionerId, setPractitioner] = useState(initialPractitioner),
    [slot, setSlot] = useState<SalonSlot | null>(null);
  const query = new URLSearchParams();
  if (date) query.set("date", date);
  if (serviceId) query.set("serviceId", serviceId);
  if (practitionerId) query.set("practitionerId", practitionerId);
  const { data, loading, error, refresh } = useSalonResource<PublicSalonData>(
    `/api/booking/${calendarId}?${query}`,
    { calendarId, date },
  );
  const mutation = useSalonMutation(
    `/api/booking/${calendarId}`,
    undefined,
    () => void refresh(),
  );
  const service = data?.services.find((item) => item.id === serviceId),
    practitioner = data?.practitioners.find(
      (item) => item.id === slot?.practitionerId,
    );
  const signInQuery = new URLSearchParams();
  if (serviceId) signInQuery.set("service", serviceId);
  if (practitionerId) signInQuery.set("practitioner", practitionerId);
  if (date || data?.date) signInQuery.set("date", date || data!.date);
  const returnTo = `/booking/${calendarId}${signInQuery.size ? `?${signInQuery}` : ""}`;
  return (
    <CoviePage className={`${styles.publicPage} ${styles.customerBooking}`}>
      <CalendarIdentity />
      <CoviePageHeader
        accent="teal"
        title={data?.businessName || "Book an appointment"}
        context="Choose a service, practitioner and available time."
        actions={
          <Link className="covie-button covie-action-secondary" href="/personal">
            My commitments
          </Link>
        }
      />
      {error ? (
        <CovieNotice tone="danger">
          {error}
          <CovieButton tone="neutral" onClick={() => void refresh()}>
            Try again
          </CovieButton>
        </CovieNotice>
      ) : null}
      {loading ? (
        <p role="status" className={styles.loading}>
          Loading available appointments…
        </p>
      ) : null}
      {data ? (
        <div className={styles.stack}>
          <div className={styles.publicIntro}>
            {data.description ? <p>{data.description}</p> : null}
            {data.location ? (
              <p className={styles.help}>{data.location}</p>
            ) : null}
            <p className={styles.help}>
              Book up to {data.advanceDays} days ahead with at least{" "}
              {data.leadMinutes} minutes’ notice. Times use {data.timezone}.
            </p>
          </div>
          <div className={styles.formColumns}>
            <label className={styles.field}>
              <span>1. Choose a service</span>
              <CovieSelect
                value={serviceId}
                disabled={mutation.busy || loading}
                onChange={(event) => {
                  setService(event.target.value);
                  if (
                    practitionerId &&
                    !data.practitioners
                      .find((person) => person.id === practitionerId)
                      ?.serviceIds.includes(event.target.value)
                  )
                    setPractitioner("");
                  setSlot(null);
                }}
              >
                <option value="">Choose a service</option>
                {data.services.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.durationMinutes} min ·{" "}
                    {salonPrice(item.priceMinor, item.currency)}
                  </option>
                ))}
              </CovieSelect>
            </label>
            <label className={styles.field}>
              <span>2. Choose a practitioner</span>
              <CovieSelect
                value={practitionerId}
                disabled={!serviceId || mutation.busy || loading}
                onChange={(event) => {
                  setPractitioner(event.target.value);
                  setSlot(null);
                }}
              >
                <option value="">No preference</option>
                {data.practitioners
                  .filter(
                    (item) => !serviceId || item.serviceIds.includes(serviceId),
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.displayName}
                    </option>
                  ))}
              </CovieSelect>
            </label>
          </div>
          {service?.description ? (
            <p className={styles.help}>{service.description}</p>
          ) : null}
          <div className={styles.planner}>
            <SalonDayPicker
              date={date || data.date}
              timezone={data.timezone}
              disabled={mutation.busy}
              onChange={(next) => {
                setDate(next);
                setSlot(null);
              }}
            />
            <section
              className={styles.stack}
              aria-label="Available appointments"
            >
              <h2 className={styles.sectionTitle}>
                {salonDateLabel(date || data.date)}
              </h2>
              {loading ? (
                <p role="status">Checking available times…</p>
              ) : !service ? (
                <CovieEmptyState
                  title="Start with a service"
                  description="Available times follow its duration and eligible practitioners."
                />
              ) : data.slots.length ? (
                <SalonAvailableTimes key={`${data.date}:${serviceId}:${practitionerId}`} slots={data.slots.filter(item => !practitionerId || item.practitionerId === practitionerId)} timezone={data.timezone} practitioners={data.practitioners} disabled={mutation.busy || loading} onChoose={item => { mutation.setError(""); setSlot(item); }} />
              ) : (
                <CovieEmptyState
                  title="No times available on this day"
                  description="Choose another day or practitioner."
                />
              )}
              <p className={styles.help}>
                Only available appointment times are shown. Other clients’
                details stay private.
              </p>
            </section>
          </div>
          {slot && service && practitioner ? (
            signedIn && mutation.status !== 401 ? (
              <AppointmentConfirmation
                slot={slot}
                service={service}
                practitioner={practitioner.displayName}
                businessName={data.businessName}
                timezone={data.timezone}
                cancellationHours={data.cancellationHours}
                defaultName={defaultName}
                busy={mutation.busy}
                error={mutation.error}
                onClose={() => setSlot(null)}
                onRefresh={() => {
                  setSlot(null);
                  void refresh();
                }}
                onSave={async (input) => {
                  const saved = await mutation.save(input);
                  if (saved?.id) {
                    router.push(`/booking/manage/${saved.id}`);
                    return true;
                  }
                  return false;
                }}
              />
            ) : (
              <CovieNotice>
                <p>
                  Sign in to confirm {service.name} with{" "}
                  {practitioner.displayName} at{" "}
                  {salonTime(slot.start, data.timezone, true)}. The time is
                  checked again after sign-in.
                </p>
                <Link
                  className={styles.link}
                  href={`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`}
                >
                  Sign in to book
                </Link>
                <CovieButton tone="neutral" onClick={() => setSlot(null)}>
                  Choose another time
                </CovieButton>
              </CovieNotice>
            )
          ) : null}
        </div>
      ) : null}
    </CoviePage>
  );
}
