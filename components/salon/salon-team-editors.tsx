"use client";
import { useState } from "react";
import {
  CovieButton,
  CovieDialog,
  CovieInput,
  CovieNotice,
  CovieSelect,
  CovieTextarea,
} from "@/components/ui/covie";
import type {
  SalonData,
  SalonPractitioner,
  SalonRole,
  SalonWorkingHours,
} from "@/lib/salon/contracts";
import type { SalonSave } from "./salon-service-editor";
import { minuteText, textMinute } from "./salon-ui";
import styles from "./salon.module.css";
export function SalonProfileEditor({
  data,
  profile,
  busy,
  error,
  onSave,
  onClose,
}: {
  data: SalonData;
  profile?: SalonPractitioner;
  busy: boolean;
  error: string;
  onSave: SalonSave;
  onClose: () => void;
}) {
  const [displayName, setName] = useState(profile?.displayName || ""),
    [bio, setBio] = useState(profile?.bio || ""),
    [kind, setKind] = useState<"staff" | "contractor">(
      profile?.kind || "staff",
    ),
    [role, setRole] = useState<SalonRole>(profile?.role || "owner"),
    [active, setActive] = useState(profile?.active ?? true),
    [bookable, setBookable] = useState(profile?.bookable ?? false);
  return (
    <CovieDialog
      id="salon-profile-editor"
      title={
        profile ? "Practitioner profile" : "Add yourself as a practitioner"
      }
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <CovieButton tone="neutral" disabled={busy} onClick={onClose}>
            Close
          </CovieButton>
          <CovieButton type="submit" form="salon-profile-form" disabled={busy}>
            {busy ? "Saving…" : "Save profile"}
          </CovieButton>
        </>
      }
    >
      <form
        id="salon-profile-form"
        className={styles.form}
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await onSave(profile ? "savePractitioner" : "addSelf", {
              displayName,
              bio,
              kind,
              ...(profile ? { id: profile.id, role, active, bookable } : {}),
            })
          )
            onClose();
        }}
      >
        {error ? <CovieNotice tone="danger">{error}</CovieNotice> : null}
        <label className={styles.field}>
          <span>Display name</span>
          <CovieInput
            value={displayName}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            required
            disabled={busy}
          />
        </label>
        <label className={styles.field}>
          <span>Bio (optional, shown when bookable)</span>
          <CovieTextarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
            disabled={busy}
          />
        </label>
        <label className={styles.field}>
          <span>Works as</span>
          <CovieSelect
            value={kind}
            onChange={(e) => setKind(e.target.value as "staff" | "contractor")}
            disabled={busy}
          >
            <option value="staff">Staff</option>
            <option value="contractor">Contractor</option>
          </CovieSelect>
        </label>
        {profile ? (
          <>
            <label className={styles.field}>
              <span>Access role</span>
              <CovieSelect
                value={role}
                onChange={(e) => setRole(e.target.value as SalonRole)}
                disabled={
                  busy || data.role !== "owner" || profile.role === "owner"
                }
              >
                {profile.role === "owner" ? (
                  <option value="owner">Owner</option>
                ) : null}
                <option value="manager">Manager</option>
                <option value="practitioner">Practitioner</option>
              </CovieSelect>
            </label>
            <p className={styles.help}>
              Managers organise business appointments and client details.
              Practitioners see their own appointments, client details and
              working hours. Only the owner appoints managers.
            </p>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                disabled={
                  busy ||
                  !data.canOrganise ||
                  profile.role === "owner" ||
                  (data.role === "manager" && profile.role !== "practitioner")
                }
              />
              Active practitioner
            </label>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={bookable}
                onChange={(e) => setBookable(e.target.checked)}
                disabled={busy || !data.canPublish}
              />
              Offer this practitioner on the client booking page
            </label>
            <p className={styles.help}>
              Deactivation removes practitioner access and stops new bookings.
              Existing appointments are not cancelled automatically; review them
              first. History remains available to the business.
            </p>
          </>
        ) : (
          <p className={styles.help}>
            This links your existing business-owner account to a practitioner
            profile. It starts with online booking turned off.
          </p>
        )}
      </form>
    </CovieDialog>
  );
}
export function SalonEligibilityEditor({
  data,
  profile,
  busy,
  error,
  onSave,
  onClose,
}: {
  data: SalonData;
  profile: SalonPractitioner;
  busy: boolean;
  error: string;
  onSave: SalonSave;
  onClose: () => void;
}) {
  const [ids, setIds] = useState(profile.serviceIds);
  return (
    <CovieDialog
      id="salon-eligibility"
      title={`Services for ${profile.displayName}`}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <CovieButton tone="neutral" disabled={busy} onClick={onClose}>
            Close
          </CovieButton>
          <CovieButton
            disabled={busy}
            onClick={() =>
              void onSave("saveEligibility", {
                practitionerId: profile.id,
                serviceIds: ids,
              }).then((saved) => {
                if (saved) onClose();
              })
            }
          >
            Save services
          </CovieButton>
        </>
      }
    >
      <div className={styles.stack}>
        {error ? <CovieNotice tone="danger">{error}</CovieNotice> : null}
        {data.services
          .filter((service) => service.active)
          .map((service) => (
            <label className={styles.checkbox} key={service.id}>
              <input
                type="checkbox"
                checked={ids.includes(service.id)}
                disabled={busy}
                onChange={(e) =>
                  setIds((current) =>
                    e.target.checked
                      ? [...current, service.id]
                      : current.filter((id) => id !== service.id),
                  )
                }
              />
              {service.name}
            </label>
          ))}
        {!data.services.some((service) => service.active) ? (
          <p>Add an active service first.</p>
        ) : null}
      </div>
    </CovieDialog>
  );
}
export function SalonHoursEditor({
  profile,
  hours,
  busy,
  error,
  onSave,
  onClose,
}: {
  profile: SalonPractitioner;
  hours: SalonWorkingHours[];
  busy: boolean;
  error: string;
  onSave: SalonSave;
  onClose: () => void;
}) {
  const [rows, setRows] = useState(
    hours
      .filter((row) => row.practitionerId === profile.id)
      .map(({ weekday, startMinute, endMinute }) => ({
        weekday,
        startMinute,
        endMinute,
      })),
  );
  function change(
    index: number,
    key: "weekday" | "startMinute" | "endMinute",
    value: number,
  ) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    );
  }
  return (
    <CovieDialog
      id="salon-hours"
      title={`Working hours for ${profile.displayName}`}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <CovieButton tone="neutral" disabled={busy} onClick={onClose}>
            Close
          </CovieButton>
          <CovieButton
            disabled={busy}
            onClick={() =>
              void onSave("saveHours", {
                practitionerId: profile.id,
                hours: rows,
              }).then((saved) => {
                if (saved) onClose();
              })
            }
          >
            Save hours
          </CovieButton>
        </>
      }
    >
      <div className={styles.form}>
        {error ? <CovieNotice tone="danger">{error}</CovieNotice> : null}
        <p className={styles.help}>
          Weekly local hours. Add separate intervals for a break. An end of
          00:00 means midnight. An empty week offers no appointment times.
        </p>
        <div className={styles.hours}>
          {rows.map((row, index) => (
            <div key={index} className={styles.hourRow}>
              <label className={styles.field}>
                <span>Day</span>
                <CovieSelect
                  value={row.weekday}
                  onChange={(e) =>
                    change(index, "weekday", Number(e.target.value))
                  }
                  disabled={busy}
                >
                  {[
                    "Sunday",
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                  ].map((day, i) => (
                    <option key={day} value={i}>
                      {day}
                    </option>
                  ))}
                </CovieSelect>
              </label>
              <label className={styles.field}>
                <span>From</span>
                <CovieInput
                  type="time"
                  value={minuteText(row.startMinute)}
                  onChange={(e) =>
                    change(index, "startMinute", textMinute(e.target.value))
                  }
                  disabled={busy}
                />
              </label>
              <label className={styles.field}>
                <span>To</span>
                <CovieInput
                  type="time"
                  value={
                    row.endMinute === 1440 ? "00:00" : minuteText(row.endMinute)
                  }
                  onChange={(e) =>
                    change(
                      index,
                      "endMinute",
                      textMinute(e.target.value) || 1440,
                    )
                  }
                  disabled={busy}
                />
              </label>
              <CovieButton
                tone="neutral"
                disabled={busy}
                aria-label={`Remove hours row ${index + 1}`}
                onClick={() =>
                  setRows((current) => current.filter((_, i) => i !== index))
                }
              >
                Remove
              </CovieButton>
            </div>
          ))}
        </div>
        <CovieButton
          tone="neutral"
          disabled={busy || rows.length >= 28}
          onClick={() =>
            setRows((current) => [
              ...current,
              { weekday: 1, startMinute: 540, endMinute: 1020 },
            ])
          }
        >
          Add hours
        </CovieButton>
      </div>
    </CovieDialog>
  );
}
export function SalonInviteEditor({
  owner,
  busy,
  error,
  onSave,
  onClose,
}: {
  owner: boolean;
  busy: boolean;
  error: string;
  onSave: SalonSave;
  onClose: () => void;
}) {
  const [displayName, setName] = useState(""),
    [role, setRole] = useState<"manager" | "practitioner">("practitioner"),
    [kind, setKind] = useState<"staff" | "contractor">("staff");
  return (
    <CovieDialog
      id="salon-invite"
      title="Create a team invitation"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <CovieButton tone="neutral" disabled={busy} onClick={onClose}>
            Close
          </CovieButton>
          <CovieButton type="submit" form="salon-invite-form" disabled={busy}>
            Create invitation
          </CovieButton>
        </>
      }
    >
      <form
        id="salon-invite-form"
        className={styles.form}
        onSubmit={async (e) => {
          e.preventDefault();
          if (await onSave("createInvite", { displayName, role, kind }))
            onClose();
        }}
      >
        {error ? <CovieNotice tone="danger">{error}</CovieNotice> : null}
        <label className={styles.field}>
          <span>Team member name</span>
          <CovieInput
            value={displayName}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            required
            disabled={busy}
          />
        </label>
        <label className={styles.field}>
          <span>Role</span>
          <CovieSelect
            value={role}
            onChange={(e) =>
              setRole(e.target.value as "manager" | "practitioner")
            }
            disabled={busy}
          >
            <option value="practitioner">Practitioner</option>
            {owner ? <option value="manager">Manager</option> : null}
          </CovieSelect>
        </label>
        <label className={styles.field}>
          <span>Works as</span>
          <CovieSelect
            value={kind}
            onChange={(e) => setKind(e.target.value as "staff" | "contractor")}
            disabled={busy}
          >
            <option value="staff">Staff</option>
            <option value="contractor">Contractor</option>
          </CovieSelect>
        </label>
        <p className={styles.help}>
          {role === "manager"
            ? "Managers can organise all business appointments and client details, services and practitioner hours. Only the owner controls booking settings, publication and manager access."
            : "Practitioners manage their own appointments, client details and working hours. They do not see other practitioners’ clients."}{" "}
          You can copy the single-use code after creating it. No email is sent
          automatically.
        </p>
      </form>
    </CovieDialog>
  );
}
