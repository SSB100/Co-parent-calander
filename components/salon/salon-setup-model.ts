import type { SalonData } from "@/lib/salon/contracts";

/** No slots or client records are inferred from configuration. */
export function salonSetupModel(data: SalonData) {
  const practitioners = data.practitioners.filter(person => person.active);
  const services = data.services.filter(service => service.active);
  const assigned = practitioners.filter(person => person.serviceIds.some(id => services.some(service => service.id === id)));
  const scheduled = assigned.filter(person => data.hours.some(hours => hours.practitionerId === person.id && hours.endMinute > hours.startMinute));
  const publiclyConfigured = scheduled.some(person => person.bookable && person.serviceIds.some(id => services.some(service => service.id === id && service.bookable)));
  return { practitioners, services, assigned, scheduled, publiclyConfigured,
    canCheckTimes: scheduled.length > 0,
    next: !practitioners.length ? { panel: "team", label: "Add a practitioner" } : !services.length ? { panel: "services", label: "Add a service" } : !assigned.length ? { panel: "team", label: "Assign services" } : !scheduled.length ? { panel: "team", label: "Set working hours" } : { panel: "book", label: "Check available times" },
  };
}
