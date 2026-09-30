# Social Groups

## Manifest

The existing Social Groups manifest remains the template source of truth: Coral + Violet, Event/activity, Calendar / Updates / Organiser, and Members / Availability / Group settings. The shared Core and co-parenting implementation stay unchanged.

Owners and explicitly appointed group admins organise events, manage group settings and invite members; only the owner can appoint or change admins. Members respond Going / Maybe / Cannot make it, share their own availability, and create events when the group permits it. They can edit or cancel their own events. View-only members cannot respond or mutate shared data. Public sharing and payments are not part of this implementation.

The calendar uses real persisted events, optional capacity, location and notes. Overlapping events are allowed; a member who chooses Going receives a non-blocking warning about their other Going events. Capacity is serialized against a row lock, preventing overbooking. Event edits use a revision and cancellation is retained in history. Lightweight availability is one shared available/unavailable response per member/date, without polls or roster controls.

Migration 0034 adds only Social settings, events, RSVPs, availability and updates, plus event/RSVP guards. It builds on 0033 purpose-specific role storage. Qualify on a development branch first and obtain explicit production migration approval. No existing memberships or co-parenting/staff data are rewritten.
