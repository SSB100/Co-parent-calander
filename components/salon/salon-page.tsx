"use client";
import { useState } from "react";
import Link from "next/link";
import {
  CovieButton,
  CovieConfirmDialog,
  CovieEmptyState,
  CovieNotice,
  CovieRecordCard,
  CovieSectionHeader,
  CovieSelect,
  CovieStatusBadge,
} from "@/components/ui/covie";
import { localDateInTimeZone } from "@/lib/calendar/time";
import type {
  SalonAppointment,
  SalonData,
  SalonPractitioner,
  SalonService,
  SalonSlot,
  SalonTimeBlock,
} from "@/lib/salon/contracts";
import { useSalonMutation, useSalonResource } from "./use-salon-resource";
import { SalonDayPicker } from "./salon-day-picker";
import { AppointmentConfirmation } from "./appointment-confirmation";
import { SalonServiceEditor, type SalonSave } from "./salon-service-editor";
import { SalonSettingsForm } from "./salon-settings-form";
import {
  SalonEligibilityEditor,
  SalonHoursEditor,
  SalonInviteEditor,
  SalonProfileEditor,
} from "./salon-team-editors";
import { SalonTimeBlockEditor } from "./salon-time-block-editor";
import { SalonRescheduleDialog } from "./salon-reschedule-dialog";
import { salonDateLabel, salonPrice, salonTime } from "./salon-ui";
import styles from "./salon.module.css";
type ProfileTool = {
  kind: "profile" | "services" | "hours" | "block";
  profile?: SalonPractitioner;
};
type Confirmation =
  | { kind: "cancel"; appointment: SalonAppointment }
  | { kind: "revoke"; id: string }
  | { kind: "unblock"; block: SalonTimeBlock };
export function SalonPage({
  calendarId,
  section,
  tool,
  initialDate = "",
  initialRecord = "",
}: {
  calendarId: string;
  section: "calendar" | "updates" | "organiser";
  tool?: string;
  initialDate?: string;
  initialRecord?: string;
}) {
  const [date, setDate] = useState(initialDate),
    [serviceId, setService] = useState(""),
    [practitionerId, setPractitioner] = useState(""),
    [slot, setSlot] = useState<SalonSlot | null>(null),
    [serviceEditor, setServiceEditor] = useState<{
      service?: SalonService;
    } | null>(null),
    [profileTool, setProfileTool] = useState<ProfileTool | null>(null),
    [inviting, setInviting] = useState(false),
    [inviteCode, setInviteCode] = useState(""),
    [notice, setNotice] = useState(""),
    [confirmation, setConfirmation] = useState<Confirmation | null>(null),
    [reschedule, setReschedule] = useState<SalonAppointment | null>(null),
    [showCancelled, setShowCancelled] = useState(false);
  const resource = useSalonResource<SalonData>(
      `/api/salon${date ? `?date=${date}` : ""}`,
      { calendarId, date },
      calendarId,
    ),
    data = resource.data,
    mutation = useSalonMutation(
      "/api/salon",
      calendarId,
      () => void resource.refresh(),
    );
  const selectedDate = date || data?.date || "";
  const slots = useSalonResource<{
    calendarId: string;
    date: string;
    slots: SalonSlot[];
  }>(
    data && serviceId
      ? `/api/salon?date=${selectedDate}&serviceId=${serviceId}${practitionerId ? `&practitionerId=${practitionerId}` : ""}`
      : null,
    { calendarId, date: selectedDate },
    calendarId,
  );
  const save: SalonSave = async (action, payload) => {
    const result = await mutation.save({ action, data: payload });
    if (!result) return false;
    setNotice(
      action === "book"
        ? "Appointment confirmed."
        : action === "reschedule"
          ? "Appointment moved."
          : action === "cancel"
            ? "Appointment cancelled."
            : "Saved.",
    );
    if (result.code) setInviteCode(result.code);
    void resource.refresh();
    void slots.refresh();
    return true;
  };
  function chooseDate(next: string) {
    setDate(next);
    setSlot(null);
    setNotice("");
    mutation.setError("");
  }
  if (!data)
    return (
      <div className={styles.stack}>
        {resource.error ? (
          <CovieNotice tone="danger">
            {resource.error}
            <div className={styles.actions}>
              <CovieButton
                tone="neutral"
                onClick={() => void resource.refresh()}
              >
                Try again
              </CovieButton>
              <CovieButton
                tone="neutral"
                onClick={() => window.location.reload()}
              >
                Reload page
              </CovieButton>
            </div>
          </CovieNotice>
        ) : (
          <p className={styles.loading} role="status">
            Loading salon…
          </p>
        )}
      </div>
    );
  const disabled = mutation.busy || resource.loading,
    service = data.services.find((value) => value.id === serviceId),
    practitioner = data.practitioners.find(
      (value) => value.id === slot?.practitionerId,
    );
  const activeProfiles = data.practitioners.filter((person) => person.active),
    own = data.practitioners.find((person) => person.own);
  const entries = data.appointments.filter(
    (appointment) =>
      (showCancelled || appointment.status !== "cancelled") &&
      (!practitionerId || appointment.practitionerId === practitionerId) &&
      localDateInTimeZone(data.timezone, new Date(appointment.start)) <=
        data.date &&
      localDateInTimeZone(
        data.timezone,
        new Date(Date.parse(appointment.end) - 1),
      ) >= data.date,
  );
  const linked = data.appointments.find(
    (appointment) => appointment.id === initialRecord,
  );
  const profileToolAllowed = Boolean(
    profileTool &&
      (profileTool.profile
        ? data.practitioners.some(
            (person) => person.id === profileTool.profile!.id,
          )
        : data.canOrganise),
  );
  const confirmationAllowed = Boolean(
    confirmation &&
      (confirmation.kind === "cancel"
        ? data.appointments.some(
            (appointment) =>
              appointment.id === confirmation.appointment.id &&
              appointment.canCancel,
          )
        : confirmation.kind === "revoke"
          ? data.canOrganise &&
            data.invitations.some((invite) => invite.id === confirmation.id)
          : data.timeBlocks.some(
              (block) => block.id === confirmation.block.id,
            )),
  );
  function appointmentCard(appointment: SalonAppointment) {
    return (
      <CovieRecordCard key={appointment.id} className={styles.record}>
        <div className={styles.row}>
          <h3>{appointment.serviceName}</h3>
          <CovieStatusBadge
            tone={appointment.status === "confirmed" ? "teal" : "neutral"}
          >
            {appointment.status === "confirmed" ? "Confirmed" : "Cancelled"}
          </CovieStatusBadge>
        </div>
        <p>
          {salonTime(appointment.start, data!.timezone, true)} to{" "}
          {salonTime(appointment.end, data!.timezone)}
        </p>
        <p>
          {appointment.practitionerName} · {appointment.clientName}
        </p>
        {appointment.clientEmail || appointment.clientPhone ? (
          <p className={styles.contact}>
            {appointment.clientEmail}
            {appointment.clientEmail && appointment.clientPhone ? " · " : ""}
            {appointment.clientPhone}
          </p>
        ) : null}
        {appointment.notes ? (
          <p className={styles.help}>{appointment.notes}</p>
        ) : null}
        <p className={styles.help}>
          {appointment.durationMinutes} minutes ·{" "}
          {salonPrice(appointment.priceMinor, appointment.currency)} · Buffer{" "}
          {appointment.bufferBeforeMinutes} min before /{" "}
          {appointment.bufferAfterMinutes} min after
        </p>
        <div className={styles.actions}>
          {appointment.canReschedule ? (
            <CovieButton
              tone="neutral"
              disabled={disabled}
              onClick={() => {
                mutation.setError("");
                setReschedule(appointment);
              }}
            >
              Move appointment
            </CovieButton>
          ) : null}
          {appointment.canCancel ? (
            <CovieButton
              tone="neutral"
              disabled={disabled}
              onClick={() => {
                mutation.setError("");
                setConfirmation({ kind: "cancel", appointment });
              }}
            >
              Cancel appointment
            </CovieButton>
          ) : null}
        </div>
      </CovieRecordCard>
    );
  }
  async function confirm() {
    if (!confirmation) return;
    const value = confirmation;
    const saved =
      value.kind === "cancel"
        ? await save("cancel", {
            id: value.appointment.id,
            version: value.appointment.version,
          })
        : value.kind === "revoke"
          ? await save("revokeInvite", { id: value.id })
          : await save("saveTimeBlock", {
              id: value.block.id,
              practitionerId: value.block.practitionerId,
              start: value.block.start,
              end: value.block.end,
              reason: value.block.reason,
              active: false,
            });
    if (saved) setConfirmation(null);
  }
  return (
    <div className={styles.stack} aria-busy={disabled}>
      {notice ? <CovieNotice tone="teal">{notice}</CovieNotice> : null}
      {mutation.error &&
      !slot &&
      !serviceEditor &&
      !profileTool &&
      !inviting &&
      !confirmation &&
      !reschedule ? (
        <CovieNotice tone="danger">{mutation.error}</CovieNotice>
      ) : null}
      {data.appointmentsTruncated ? (
        <CovieNotice>
          The upcoming list is limited. Choose a date for its full schedule.
        </CovieNotice>
      ) : null}
      {inviteCode && data.canOrganise ? (
        <CovieNotice tone="violet">
          <p>Single-use team invitation. Share it with the intended person.</p>
          <p className={styles.code}>{inviteCode}</p>
          <CovieButton tone="neutral" onClick={() => setInviteCode("")}>
            Dismiss code
          </CovieButton>
        </CovieNotice>
      ) : null}
      {section === "calendar" ? (
        <>
          <div className={styles.toolbar}>
            <p className={styles.help}>
              {data.canOrganise ? "Business appointments" : "Your appointments"}{" "}
              · {data.timezone}
            </p>
            <CovieButton
              tone="neutral"
              disabled={disabled}
              onClick={() => {
                void resource.refresh();
                void slots.refresh();
              }}
            >
              Refresh salon
            </CovieButton>
          </div>
          {initialRecord ? (
            <section
              className={styles.stack}
              aria-label="Appointment from Personal"
            >
              {resource.loading ? (
                <p role="status">Checking the latest appointment…</p>
              ) : linked ? (
                appointmentCard(linked)
              ) : (
                <CovieNotice>
                  This appointment is no longer available here. Refresh Personal
                  for the latest items.
                </CovieNotice>
              )}
            </section>
          ) : null}
          <div className={styles.planner}>
            <SalonDayPicker
              date={selectedDate}
              timezone={data.timezone}
              disabled={mutation.busy}
              onChange={chooseDate}
            />
            <div className={styles.stack}>
              <CovieSectionHeader title={salonDateLabel(selectedDate)} />
              <label className={styles.field}>
                <span>Practitioner</span>
                <CovieSelect
                  value={practitionerId}
                  disabled={disabled}
                  onChange={(event) => {
                    setPractitioner(event.target.value);
                    setSlot(null);
                  }}
                >
                  <option value="">
                    {data.canOrganise ? "All practitioners" : "My appointments"}
                  </option>
                  {activeProfiles.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.displayName}
                    </option>
                  ))}
                </CovieSelect>
              </label>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={showCancelled}
                  onChange={(event) => setShowCancelled(event.target.checked)}
                />
                Show cancelled appointments
              </label>
              {resource.loading ? (
                <p role="status">Loading this day’s appointments…</p>
              ) : entries.length ? (
                <section className={styles.stack} aria-label="Day appointments">
                  {entries.map(appointmentCard)}
                </section>
              ) : (
                <CovieEmptyState
                  title="No appointments on this day"
                  description="Choose a service below to find a time."
                />
              )}
              {!resource.loading &&
                data.timeBlocks
                  .filter(
                    (block) =>
                      !practitionerId ||
                      block.practitionerId === practitionerId,
                  )
                  .map((block) => (
                    <CovieRecordCard key={block.id}>
                      <strong>
                        Blocked time ·{" "}
                        {
                          data.practitioners.find(
                            (person) => person.id === block.practitionerId,
                          )?.displayName
                        }
                      </strong>
                      <p>
                        {salonTime(block.start, data.timezone, true)} to{" "}
                        {salonTime(block.end, data.timezone, true)}
                      </p>
                      {block.reason ? (
                        <p className={styles.help}>{block.reason}</p>
                      ) : null}
                    </CovieRecordCard>
                  ))}
              <CovieSectionHeader title="Book an appointment" />
              <label className={styles.field}>
                <span>Service</span>
                <CovieSelect
                  value={serviceId}
                  disabled={disabled}
                  onChange={(event) => {
                    setService(event.target.value);
                    setSlot(null);
                  }}
                >
                  <option value="">Choose a service</option>
                  {data.services
                    .filter((item) => item.active)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.durationMinutes} min
                      </option>
                    ))}
                </CovieSelect>
              </label>
              {slots.error ? (
                <CovieNotice tone="danger">
                  {slots.error}
                  <CovieButton
                    tone="neutral"
                    onClick={() => void slots.refresh()}
                  >
                    Refresh times
                  </CovieButton>
                </CovieNotice>
              ) : null}
              {serviceId ? (
                slots.loading ? (
                  <p role="status">Loading available times…</p>
                ) : slots.data?.slots.length ? (
                  <div className={styles.slots}>
                    {slots.data.slots.map((candidate) => (
                      <button
                        key={`${candidate.practitionerId}:${candidate.start}`}
                        className={styles.slot}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          mutation.setError("");
                          setSlot(candidate);
                        }}
                      >
                        <strong>
                          {salonTime(candidate.start, data.timezone)}
                        </strong>
                        <span>
                          {
                            data.practitioners.find(
                              (person) =>
                                person.id === candidate.practitionerId,
                            )?.displayName
                          }
                        </span>
                        <small>
                          to {salonTime(candidate.end, data.timezone)}
                        </small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className={styles.help}>
                    No times are available. Check the service eligibility,
                    practitioner hours and booking rules, or choose another day.
                  </p>
                )
              ) : null}
            </div>
          </div>
        </>
      ) : section === "updates" ? (
        <>
          <CovieSectionHeader title="Appointment updates" />
          {data.updates.length ? (
            <ol className={styles.history}>
              {data.updates.map((update) => (
                <li key={update.id}>
                  <strong>{update.action.replaceAll("_", " ")}</strong>
                  <p>{salonTime(update.createdAt, data.timezone, true)}</p>
                </li>
              ))}
            </ol>
          ) : (
            <CovieEmptyState
              title="No updates yet"
              description="Appointment changes appear here."
            />
          )}
        </>
      ) : tool === "services" ? (
        <>
          <CovieSectionHeader
            title="Services"
            actions={
              data.canOrganise ? (
                <CovieButton
                  disabled={disabled}
                  onClick={() => {
                    mutation.setError("");
                    setServiceEditor({});
                  }}
                >
                  Add service
                </CovieButton>
              ) : undefined
            }
          />
          {data.services.length ? (
            <div className={styles.cards}>
              {data.services.map((item) => (
                <CovieRecordCard key={item.id} className={styles.record}>
                  <h3>{item.name}</h3>
                  <p>
                    {item.durationMinutes} minutes ·{" "}
                    {salonPrice(item.priceMinor, item.currency)}
                  </p>
                  <p className={styles.help}>
                    Buffers: {item.bufferBeforeMinutes} min before,{" "}
                    {item.bufferAfterMinutes} min after
                  </p>
                  <p>{item.description}</p>
                  <CovieStatusBadge tone={item.active ? "teal" : "neutral"}>
                    {item.active
                      ? item.bookable
                        ? "Offered online"
                        : "Internal bookings"
                      : "Archived"}
                  </CovieStatusBadge>
                  {data.canOrganise ? (
                    <CovieButton
                      tone="neutral"
                      disabled={disabled}
                      onClick={() => {
                        mutation.setError("");
                        setServiceEditor({ service: item });
                      }}
                    >
                      Edit service
                    </CovieButton>
                  ) : null}
                </CovieRecordCard>
              ))}
            </div>
          ) : (
            <CovieEmptyState
              title="No services yet"
              description="Add the appointment types your team offers."
            />
          )}
        </>
      ) : tool === "booking-settings" ? (
        <>
          <CovieSectionHeader title="Booking settings" />
          {data.settings.publicEnabled ? (
            <CovieNotice tone="teal">
              <Link
                className={styles.link}
                href={`/booking/${calendarId}`}
                target="_blank"
                rel="noreferrer"
              >
                Open client booking page
              </Link>
              <p className={styles.help}>
                Share this page when your services, practitioners and hours are
                ready.
              </p>
            </CovieNotice>
          ) : null}
          <SalonSettingsForm
            key={JSON.stringify(data.settings)}
            settings={data.settings}
            canPublish={data.canPublish}
            busy={disabled}
            error={mutation.error}
            onSave={save}
          />
        </>
      ) : (
        <>
          <CovieSectionHeader
            title={data.canOrganise ? "Team" : "My practitioner profile"}
            actions={
              <div className={styles.actions}>
                {data.role === "owner" && !own ? (
                  <CovieButton
                    disabled={disabled}
                    onClick={() => {
                      mutation.setError("");
                      setProfileTool({ kind: "profile" });
                    }}
                  >
                    Add myself
                  </CovieButton>
                ) : null}
                {data.canOrganise ? (
                  <CovieButton
                    disabled={disabled}
                    onClick={() => {
                      mutation.setError("");
                      setInviting(true);
                    }}
                  >
                    Invite team member
                  </CovieButton>
                ) : null}
              </div>
            }
          />
          {data.practitioners.length ? (
            <div className={styles.cards}>
              {data.practitioners.map((person) => (
                <CovieRecordCard key={person.id} className={styles.record}>
                  <h3>
                    {person.displayName}
                    {person.own ? " · You" : ""}
                  </h3>
                  <p className={styles.help}>
                    {person.role} · {person.kind}
                  </p>
                  <CovieStatusBadge tone={person.active ? "teal" : "neutral"}>
                    {person.active
                      ? person.bookable
                        ? "Bookable online"
                        : "Internal bookings"
                      : "Inactive"}
                  </CovieStatusBadge>
                  {person.bio ? <p>{person.bio}</p> : null}
                  <div className={styles.actions}>
                    {data.role === "owner" ||
                    person.own ||
                    (data.role === "manager" &&
                      person.role === "practitioner") ? (
                      <CovieButton
                        tone="neutral"
                        disabled={disabled}
                        onClick={() => {
                          mutation.setError("");
                          setProfileTool({ kind: "profile", profile: person });
                        }}
                      >
                        Edit profile
                      </CovieButton>
                    ) : null}
                    {data.canOrganise ? (
                      <CovieButton
                        tone="neutral"
                        disabled={disabled}
                        onClick={() => {
                          mutation.setError("");
                          setProfileTool({ kind: "services", profile: person });
                        }}
                      >
                        Services
                      </CovieButton>
                    ) : null}
                    <CovieButton
                      tone="neutral"
                      disabled={disabled || !person.active}
                      onClick={() => {
                        mutation.setError("");
                        setProfileTool({ kind: "hours", profile: person });
                      }}
                    >
                      Working hours
                    </CovieButton>
                    <CovieButton
                      tone="neutral"
                      disabled={disabled || !person.active}
                      onClick={() => {
                        mutation.setError("");
                        setProfileTool({ kind: "block", profile: person });
                      }}
                    >
                      Time off
                    </CovieButton>
                    {person.active &&
                    person.bookable &&
                    data.settings.publicEnabled ? (
                      <Link
                        className={styles.link}
                        href={`/booking/${calendarId}?practitioner=${person.id}`}
                      >
                        Client booking page
                      </Link>
                    ) : null}
                  </div>
                </CovieRecordCard>
              ))}
            </div>
          ) : (
            <CovieEmptyState
              title="No practitioners yet"
              description="Add yourself or invite your team to get started."
            />
          )}
          <section className={styles.stack}>
            <CovieSectionHeader
              title="Time off and busy blocks"
              description={`Selected day: ${salonDateLabel(selectedDate)}`}
            />
            <SalonDayPicker
              date={selectedDate}
              timezone={data.timezone}
              disabled={mutation.busy}
              onChange={chooseDate}
            />
            {resource.loading ? (
              <p role="status">Loading this day’s time off…</p>
            ) : (
              data.timeBlocks.map((block) => (
                <CovieRecordCard key={block.id}>
                  <p>
                    {
                      data.practitioners.find(
                        (person) => person.id === block.practitionerId,
                      )?.displayName
                    }{" "}
                    · {salonTime(block.start, data.timezone, true)} to{" "}
                    {salonTime(block.end, data.timezone, true)}
                  </p>
                  <p className={styles.help}>{block.reason}</p>
                  <CovieButton
                    tone="neutral"
                    disabled={disabled}
                    onClick={() => {
                      mutation.setError("");
                      setConfirmation({ kind: "unblock", block });
                    }}
                  >
                    Remove block
                  </CovieButton>
                </CovieRecordCard>
              ))
            )}
          </section>
          {data.canOrganise ? (
            <section className={styles.stack}>
              <CovieSectionHeader title="Invitations" />
              {data.invitations.length ? (
                data.invitations.map((invite) => (
                  <CovieRecordCard key={invite.id}>
                    <strong>{invite.displayName}</strong>
                    <p className={styles.help}>
                      {invite.role} · {invite.kind} ·{" "}
                      {invite.revoked
                        ? "Revoked"
                        : invite.used
                          ? "Accepted"
                          : `Code ending ${invite.codeHint}`}
                    </p>
                    {!invite.revoked && !invite.used ? (
                      <CovieButton
                        tone="neutral"
                        disabled={disabled}
                        onClick={() => {
                          mutation.setError("");
                          setConfirmation({ kind: "revoke", id: invite.id });
                        }}
                      >
                        Revoke invitation
                      </CovieButton>
                    ) : null}
                  </CovieRecordCard>
                ))
              ) : (
                <p className={styles.help}>No team invitations yet.</p>
              )}
            </section>
          ) : null}
        </>
      )}
      {slot && service && practitioner ? (
        <AppointmentConfirmation
          slot={slot}
          service={service}
          practitioner={practitioner.displayName}
          businessName={data.settings.businessName}
          timezone={data.timezone}
          cancellationHours={data.settings.cancellationHours}
          internal
          busy={mutation.busy}
          error={mutation.error}
          onClose={() => setSlot(null)}
          onRefresh={() => {
            setSlot(null);
            void resource.refresh();
            void slots.refresh();
          }}
          onSave={(input) => save("book", input)}
        />
      ) : null}
      {serviceEditor && data.canOrganise ? (
        <SalonServiceEditor
          service={serviceEditor.service}
          busy={mutation.busy}
          error={mutation.error}
          onSave={save}
          onClose={() => setServiceEditor(null)}
        />
      ) : null}
      {profileToolAllowed && profileTool?.kind === "profile" ? (
        <SalonProfileEditor
          data={data}
          profile={profileTool.profile}
          busy={mutation.busy}
          error={mutation.error}
          onSave={save}
          onClose={() => setProfileTool(null)}
        />
      ) : null}
      {profileToolAllowed &&
      profileTool?.kind === "services" &&
      profileTool.profile ? (
        <SalonEligibilityEditor
          data={data}
          profile={profileTool.profile}
          busy={mutation.busy}
          error={mutation.error}
          onSave={save}
          onClose={() => setProfileTool(null)}
        />
      ) : null}
      {profileToolAllowed &&
      profileTool?.kind === "hours" &&
      profileTool.profile ? (
        <SalonHoursEditor
          profile={profileTool.profile}
          hours={data.hours}
          busy={mutation.busy}
          error={mutation.error}
          onSave={save}
          onClose={() => setProfileTool(null)}
        />
      ) : null}
      {profileToolAllowed &&
      profileTool?.kind === "block" &&
      profileTool.profile ? (
        <SalonTimeBlockEditor
          profile={profileTool.profile}
          date={data.date}
          timezone={data.timezone}
          busy={mutation.busy}
          error={mutation.error}
          onSave={save}
          onClose={() => setProfileTool(null)}
        />
      ) : null}
      {inviting && data.canOrganise ? (
        <SalonInviteEditor
          owner={data.role === "owner"}
          busy={mutation.busy}
          error={mutation.error}
          onSave={save}
          onClose={() => setInviting(false)}
        />
      ) : null}
      {reschedule &&
      data.appointments.some(
        (appointment) =>
          appointment.id === reschedule.id && appointment.canReschedule,
      ) ? (
        <SalonRescheduleDialog
          calendarId={calendarId}
          appointment={reschedule}
          timezone={data.timezone}
          busy={mutation.busy}
          error={mutation.error}
          onSave={save}
          onClose={() => setReschedule(null)}
          onRefresh={() => {
            setReschedule(null);
            mutation.setError("");
            void resource.refresh();
            void slots.refresh();
          }}
        />
      ) : null}
      <CovieConfirmDialog
        open={confirmationAllowed}
        id="salon-confirm-change"
        title={
          confirmation?.kind === "cancel"
            ? "Cancel this appointment?"
            : confirmation?.kind === "revoke"
              ? "Revoke this invitation?"
              : "Remove this time block?"
        }
        description={
          <div className={styles.stack}>
            <p>
              {confirmation?.kind === "cancel"
                ? "The appointment will be cancelled and its history retained."
                : confirmation?.kind === "revoke"
                  ? "The code will stop working. Existing accepted members keep their current access."
                  : "This time can become available for appointments again. The old block stays in history."}
            </p>
            {mutation.error ? (
              <CovieNotice tone="danger">
                <p>{mutation.error}</p>
                <CovieButton
                  tone="neutral"
                  disabled={mutation.busy}
                  onClick={() => {
                    setConfirmation(null);
                    mutation.setError("");
                    void resource.refresh();
                    void slots.refresh();
                  }}
                >
                  Refresh salon
                </CovieButton>
              </CovieNotice>
            ) : null}
          </div>
        }
        confirmLabel={
          mutation.busy
            ? "Saving…"
            : confirmation?.kind === "cancel"
              ? "Cancel appointment"
              : confirmation?.kind === "revoke"
                ? "Revoke invitation"
                : "Remove block"
        }
        cancelLabel="Keep it"
        busy={mutation.busy}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => void confirm()}
      />
    </div>
  );
}
