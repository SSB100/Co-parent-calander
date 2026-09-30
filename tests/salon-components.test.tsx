import "./support/salon-dom-environment";
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import type {
  OwnSalonAppointment,
  PublicSalonData,
  SalonData,
} from "../lib/salon/contracts";
import { dom, styleHooks } from "./support/salon-dom-environment";

// These tests render production components and control only HTTP replies and
// Next's router context. No database, real account or external request is used.
let PublicBookingPage: typeof import("../components/salon/public-booking-page").PublicBookingPage;
let OwnAppointmentPage: typeof import("../components/salon/own-appointment-page").OwnAppointmentPage;
let SalonPage: typeof import("../components/salon/salon-page").SalonPage;
let root: Root;
let container: HTMLDivElement;
const originalFetch = globalThis.fetch;
const calendarId = "10000000-0000-4000-8000-000000000001";
const practitionerId = "20000000-0000-4000-8000-000000000001";
const serviceId = "30000000-0000-4000-8000-000000000001";
const otherServiceId = "30000000-0000-4000-8000-000000000002";
const appointmentId = "40000000-0000-4000-8000-000000000001";
const date = "2026-10-02";
const slot = {
  practitionerId,
  start: `${date}T09:00:00.000Z`,
  end: `${date}T09:30:00.000Z`,
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const router: AppRouterInstance = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
  bfcacheId: "synthetic-dom-test",
};

function menu(): PublicSalonData {
  return {
    calendarId,
    businessName: "Synthetic Salon",
    description: "",
    location: "",
    timezone: "UTC",
    date,
    cancellationHours: 24,
    leadMinutes: 0,
    advanceDays: 90,
    services: [
      {
        id: serviceId,
        name: "Cut",
        description: "",
        durationMinutes: 30,
        priceMinor: 5000,
        currency: "NZD",
      },
      {
        id: otherServiceId,
        name: "Colour",
        description: "",
        durationMinutes: 60,
        priceMinor: 9000,
        currency: "NZD",
      },
    ],
    practitioners: [
      {
        id: practitionerId,
        displayName: "Alice",
        bio: "",
        serviceIds: [serviceId],
      },
    ],
    slots: [slot],
  };
}
function own(): OwnSalonAppointment {
  return {
    calendarId,
    businessName: "Synthetic Salon",
    location: "",
    timezone: "UTC",
    date,
    slots: [
      { ...slot, start: `${date}T12:00:00.000Z`, end: `${date}T12:30:00.000Z` },
    ],
    appointment: {
      id: appointmentId,
      practitionerId,
      practitionerName: "Alice",
      serviceId,
      serviceName: "Cut",
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      priceMinor: 5000,
      currency: "NZD",
      cancellationHours: 24,
      start: slot.start,
      end: slot.end,
      busyStart: slot.start,
      busyEnd: slot.end,
      status: "confirmed",
      version: 1,
      clientName: "Synthetic Client",
      clientEmail: "client@example.invalid",
      clientPhone: "",
      ownClient: true,
      ownPractitioner: false,
      canManage: true,
      canCancel: true,
      canReschedule: true,
    },
  };
}
function salon(day = date): SalonData {
  return {
    calendarId,
    timezone: "UTC",
    date: day,
    role: "owner",
    ownPractitionerId: practitionerId,
    canOrganise: true,
    canPublish: true,
    settings: {
      businessName: "Synthetic Salon",
      description: "",
      location: "",
      publicEnabled: false,
      leadMinutes: 0,
      advanceDays: 90,
      slotMinutes: 15,
      cancellationHours: 24,
    },
    practitioners: [
      {
        id: practitionerId,
        displayName: "Alice",
        bio: "",
        role: "owner",
        kind: "staff",
        active: true,
        bookable: false,
        own: true,
        serviceIds: [serviceId],
      },
    ],
    services: [],
    hours: [],
    appointments: [],
    appointmentsTruncated: false,
    updates: [],
    invitations: [],
    timeBlocks: [
      {
        id: "50000000-0000-4000-8000-000000000001",
        practitionerId,
        start: `${day}T10:00:00.000Z`,
        end: `${day}T11:00:00.000Z`,
        reason: `Private block for ${day}`,
        active: true,
      },
    ],
  };
}
function element<T extends Element = HTMLElement>(
  selector: string,
  scope: ParentNode = container,
): T {
  const found = scope.querySelector<T>(selector);
  assert.ok(found, `Missing rendered element: ${selector}`);
  return found;
}
function button(
  label: string,
  scope: ParentNode = container,
): HTMLButtonElement {
  const found = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(
    (value) => value.textContent?.trim() === label,
  );
  assert.ok(found, `Missing rendered button: ${label}`);
  return found;
}
async function settle(check: () => void) {
  let last: unknown;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    try {
      check();
      return;
    } catch (error) {
      last = error;
    }
  }
  throw last;
}
async function render(node: ReactNode) {
  await act(async () =>
    root.render(
      <AppRouterContext.Provider value={router}>
        {node}
      </AppRouterContext.Provider>,
    ),
  );
}
async function click(target: HTMLElement) {
  await act(async () => target.click());
}
async function refreshOnFocus() {
  await act(async () => window.dispatchEvent(new Event("focus")));
}
async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function submitBooking() {
  await act(async () =>
    element<HTMLFormElement>("#salon-booking-form").dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    ),
  );
}

before(async () => {
  ({ PublicBookingPage } =
    await import("../components/salon/public-booking-page"));
  ({ OwnAppointmentPage } =
    await import("../components/salon/own-appointment-page"));
  ({ SalonPage } = await import("../components/salon/salon-page"));
});
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  globalThis.fetch = async () => {
    throw new Error("Unexpected test request");
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  globalThis.fetch = originalFetch;
});
after(() => {
  styleHooks.deregister();
  dom.window.close();
});

test("confirmation preserves reviewed terms, interval and request ID after a menu refresh and interrupted response", async () => {
  let currentMenu = menu();
  let reads = 0;
  const posted: Record<string, unknown>[] = [];
  globalThis.fetch = async (_url, init) => {
    if (init?.method === "POST") {
      posted.push(JSON.parse(String(init.body)));
      throw new TypeError("Synthetic interrupted response");
    }
    reads += 1;
    return json(currentMenu);
  };
  await render(
    <PublicBookingPage
      calendarId={calendarId}
      signedIn
      defaultName="Synthetic Client"
      initialDate={date}
      initialService={serviceId}
      initialPractitioner={practitionerId}
    />,
  );
  await settle(() => element("button.slot"));
  await click(element("button.slot"));
  await submitBooking();
  assert.equal(posted.length, 1);
  const firstDialog = element('[role="dialog"]');
  const originalSummary = element(".summary", firstDialog).textContent;
  const refreshed = menu();
  refreshed.services[0] = {
    ...refreshed.services[0],
    name: "Long cut",
    durationMinutes: 60,
    priceMinor: 7000,
  };
  refreshed.slots[0] = { ...slot, end: `${date}T10:00:00.000Z` };
  refreshed.cancellationHours = 48;
  currentMenu = refreshed;
  await refreshOnFocus();
  await settle(() => {
    assert.equal(reads, 2);
    assert.match(container.textContent ?? "", /Long cut/);
  });
  assert.equal(
    element('[role="dialog"]'),
    firstDialog,
    "Revalidation must preserve the mounted draft",
  );
  assert.equal(element(".summary", firstDialog).textContent, originalSummary);
  assert.match(firstDialog.textContent ?? "", /at least 24 hours/);
  await submitBooking();
  assert.equal(posted.length, 2);
  assert.deepEqual(
    posted[1],
    posted[0],
    "An ambiguous retry must use the exact original payload",
  );
  await click(button("Refresh details and times", firstDialog));
  await settle(() => {
    assert.equal(container.querySelector('[role="dialog"]'), null);
    element("button.slot");
  });
  await click(element("button.slot"));
  assert.match(element('[role="dialog"]').textContent ?? "", /Long cut/);
  assert.match(
    element('[role="dialog"]').textContent ?? "",
    /at least 48 hours/,
  );
  await submitBooking();
  assert.notEqual(posted[2].requestId, posted[0].requestId);
  assert.deepEqual(posted[2].expectedTerms, {
    serviceName: "Long cut",
    durationMinutes: 60,
    priceMinor: 7000,
    currency: "NZD",
    cancellationHours: 48,
  });
});

for (const action of ["cancel", "reschedule"] as const) {
  test(`${action} confirmation retains the reviewed appointment version through focus refresh`, async () => {
    let current = own();
    const posted: {
      action: string;
      data: { id: string; version: number; start?: string };
    }[] = [];
    let reads = 0;
    globalThis.fetch = async (_url, init) => {
      if (init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)));
        return json(
          { error: "This appointment changed. Refresh and review it." },
          409,
        );
      }
      reads += 1;
      return json(current);
    };
    await render(<OwnAppointmentPage appointmentId={appointmentId} />);
    await settle(() => button("Choose a new time"));
    if (action === "cancel") await click(button("Cancel appointment"));
    else {
      await click(button("Choose a new time"));
      await click(element("button.slot"));
    }
    const firstDialog = element('[role="dialog"]');
    current = own();
    current.appointment = {
      ...current.appointment,
      version: 2,
      start: `${date}T10:00:00.000Z`,
      end: `${date}T10:30:00.000Z`,
    };
    await refreshOnFocus();
    await settle(() => assert.equal(reads, 2));
    assert.equal(element('[role="dialog"]'), firstDialog);
    await click(
      button(
        action === "cancel" ? "Cancel appointment" : "Confirm new time",
        firstDialog,
      ),
    );
    assert.equal(posted[0].data.version, 1);
    assert.equal(posted[0].data.id, appointmentId);
    assert.equal(posted[0].action, action);
    if (action === "reschedule")
      assert.equal(posted[0].data.start, `${date}T12:00:00.000Z`);
    await click(button("Refresh appointment", firstDialog));
    await settle(() => {
      assert.equal(container.querySelector('[role="dialog"]'), null);
      assert.equal(reads, 3);
    });
    if (action === "cancel") await click(button("Cancel appointment"));
    else {
      await click(button("Choose a new time"));
      await click(element("button.slot"));
    }
    await click(
      button(
        action === "cancel" ? "Cancel appointment" : "Confirm new time",
        element('[role="dialog"]'),
      ),
    );
    assert.equal(
      posted[1].data.version,
      2,
      "Only an explicit fresh review may use the new version",
    );
  });
}

test("a practitioner share link survives an eligible service choice and clears an incompatible choice", async () => {
  const requests: URL[] = [];
  globalThis.fetch = async (url) => {
    requests.push(new URL(String(url), window.location.href));
    return json(menu());
  };
  await render(
    <PublicBookingPage
      calendarId={calendarId}
      signedIn={false}
      initialDate={date}
      initialPractitioner={practitionerId}
    />,
  );
  await settle(() => element("select"));
  const [service, practitioner] = [
    ...container.querySelectorAll<HTMLSelectElement>("select"),
  ];
  assert.equal(practitioner.value, practitionerId);
  await choose(service, serviceId);
  await settle(() =>
    assert.equal(requests.at(-1)?.searchParams.get("serviceId"), serviceId),
  );
  assert.equal(practitioner.value, practitionerId);
  assert.equal(
    requests.at(-1)?.searchParams.get("practitionerId"),
    practitionerId,
  );
  await choose(service, otherServiceId);
  await settle(() =>
    assert.equal(
      requests.at(-1)?.searchParams.get("serviceId"),
      otherServiceId,
    ),
  );
  assert.equal(practitioner.value, "");
  assert.equal(requests.at(-1)?.searchParams.has("practitionerId"), false);
});

test("Team date navigation keeps keyboard focus while fetching and ignores a late prior day", async () => {
  const pending: { date: string; resolve: (response: Response) => void }[] = [];
  let initial = true;
  globalThis.fetch = async (url) => {
    if (initial) {
      initial = false;
      return json(salon());
    }
    const requestedDate = new URL(
      String(url),
      window.location.href,
    ).searchParams.get("date")!;
    return new Promise((resolve) =>
      pending.push({ date: requestedDate, resolve }),
    );
  };
  await render(
    <SalonPage
      calendarId={calendarId}
      section="organiser"
      tool="team"
      initialDate={date}
    />,
  );
  await settle(() => element(`button[data-date="${date}"]`));
  await act(async () =>
    element<HTMLButtonElement>(`button[data-date="${date}"]`).focus(),
  );
  const arrowRight = async () =>
    act(async () =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowRight",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
  await arrowRight();
  await settle(() => assert.equal(pending[0]?.date, "2026-10-03"));
  assert.equal(
    document.activeElement,
    element('button[data-date="2026-10-03"]'),
  );
  assert.doesNotMatch(
    container.textContent ?? "",
    /Private block for 2026-10-02/,
  );
  await arrowRight();
  await settle(() => assert.equal(pending[1]?.date, "2026-10-04"));
  assert.equal(
    document.activeElement,
    element('button[data-date="2026-10-04"]'),
  );
  await act(async () => pending[0].resolve(json(salon("2026-10-03"))));
  assert.equal(
    element('button[aria-pressed="true"]').getAttribute("data-date"),
    "2026-10-04",
  );
  assert.doesNotMatch(
    container.textContent ?? "",
    /Private block for 2026-10-03/,
  );
  await act(async () => pending[1].resolve(json(salon("2026-10-04"))));
  await settle(() =>
    assert.match(container.textContent ?? "", /Private block for 2026-10-04/),
  );
  assert.equal(
    document.activeElement,
    element('button[data-date="2026-10-04"]'),
  );
});

test("a rejected private revalidation removes previously rendered private details", async () => {
  let revoked = false;
  globalThis.fetch = async () =>
    revoked
      ? json({ error: "Salon access changed. Reload this page." }, 403)
      : json(salon());
  await render(
    <SalonPage
      calendarId={calendarId}
      section="organiser"
      tool="team"
      initialDate={date}
    />,
  );
  await settle(() =>
    assert.match(container.textContent ?? "", /Private block for/),
  );
  revoked = true;
  await refreshOnFocus();
  await settle(() =>
    assert.match(container.textContent ?? "", /Salon access changed/),
  );
  assert.doesNotMatch(container.textContent ?? "", /Private block for|Alice/);
  assert.equal(
    container.querySelector('[aria-label="Choose appointment day"]'),
    null,
  );
});

test("a successful reduced-scope refresh dismisses another practitioner's open editor", async () => {
  let current = salon();
  current.role = "manager";
  current.canPublish = false;
  current.practitioners[0].role = "manager";
  current.practitioners.push({
    ...current.practitioners[0],
    id: "20000000-0000-4000-8000-000000000002",
    displayName: "Synthetic Other Practitioner",
    bio: "Previously visible profile",
    role: "practitioner",
    own: false,
  });
  globalThis.fetch = async () => json(current);
  await render(
    <SalonPage
      calendarId={calendarId}
      section="organiser"
      tool="team"
      initialDate={date}
    />,
  );
  await settle(() =>
    assert.match(container.textContent ?? "", /Synthetic Other Practitioner/),
  );
  const otherCard = [
    ...container.querySelectorAll<HTMLElement>(".record"),
  ].find(
    (card) =>
      card.querySelector("h3")?.textContent === "Synthetic Other Practitioner",
  );
  assert.ok(otherCard);
  await click(button("Edit profile", otherCard));
  assert.equal(
    element<HTMLInputElement>('[role="dialog"] input').value,
    "Synthetic Other Practitioner",
  );
  current = salon();
  current.role = "practitioner";
  current.canOrganise = false;
  current.canPublish = false;
  current.practitioners[0].role = "practitioner";
  await refreshOnFocus();
  await settle(() => {
    assert.equal(container.querySelector('[role="dialog"]'), null);
    assert.match(container.textContent ?? "", /My practitioner profile/);
  });
  assert.doesNotMatch(
    container.textContent ?? "",
    /Synthetic Other Practitioner|Previously visible profile|Invite team member/,
  );
  await click(button("Edit profile"));
  assert.equal(
    element<HTMLInputElement>('[role="dialog"] input').value,
    "Alice",
    "The remaining own profile stays usable after demotion",
  );
});
