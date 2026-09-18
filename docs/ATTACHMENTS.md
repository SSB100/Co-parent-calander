# Documents / Attachments

> **Current release status — 18 September 2026:** Attachment code and migration `0010` are live in Covie Production. The application-side private Blob flow is implemented and covered by CI, but the actual **Vercel Private Blob store attachment is still unverified**. The connected project metadata available during this cleanup does not expose Blob-store connections or project environment variables, so uploads/profile photos must not be considered production-verified until the store is confirmed and an end-to-end private upload/download test passes.

Phase 7 adds one reusable private-file layer to Covie.

The purpose is to support the practical files that naturally belong to co-parenting records without turning Covie into a general cloud drive.

Examples:

- receipts
- school forms
- medical letters
- registration documents
- camp information
- insurance documents
- child profile photos
- other useful supporting files

## Product boundary

Files attach primarily to an existing Covie record:

- Expense
- Responsibility
- Event
- Child profile

Covie does not introduce a large standalone folder/file-management product in Phase 7.

The underlying attachment-link model is reusable so Phase 8 can connect one document to additional related Covie records where that improves real workflows.

## Storage architecture

File bytes are stored in **Vercel Private Blob**.

Neon stores only attachment metadata and relationships.

The database never stores:

- file bytes
- base64 file payloads
- permanent public file URLs
- permanent signed download URLs

The application stores a provider-neutral private object key in `attachments.storage_key`.

Current provider:

- `storage_provider = vercel_blob`

This keeps the relational model independent from the storage provider if Covie changes object storage later.

## Authentication

The intended production configuration uses the private Blob store attached to the Covie Vercel project.

Vercel Functions can authenticate to that store through Vercel OIDC.

The current code relies on Vercel Blob's server-side authentication resolution and does not hardcode a permanent storage credential. Vercel's current private-Blob documentation supports project OIDC or Blob store credentials for server-side access.

The connected Vercel project reader used during this cleanup confirms the active `co-parent-calander` project, but it does not expose its Blob-store list or environment-variable inventory. Therefore the store connection remains **unverified**, not assumed absent.

Before enabling uploads in Production, confirm the active project has a **private** Blob store attached. Vercel documents `vercel blob list-stores` / `vercel blob get-store` as the direct verification path. Then perform a real signed PUT, metadata verification, signed GET and delete test against the Production project.

## Upload flow

Uploads use short-lived, single-object presigned PUT URLs.

1. Editor asks Covie to prepare an upload.
2. Covie validates the selected family calendar and target record.
3. Covie validates file name, type, size, category and role.
4. Covie inserts a Pending attachment row bound to that exact target.
5. Covie issues a short-lived signed PUT URL for one private Blob pathname.
6. Browser uploads the bytes directly to Private Blob.
7. Browser asks Covie to finalize the attachment.
8. Covie verifies Blob metadata including pathname, byte size and MIME type.
9. Only then does the attachment become Ready and visible.
10. Covie writes the attachment link and audit record transactionally.

This avoids routing large file bodies through the application function.

A pending upload cannot be finalized against a different expense, responsibility, event or child.

## Downloads

Downloads are permission checked through the selected Covie calendar.

Covie does not return a permanent Blob URL.

Instead:

1. user asks to open the file
2. Covie verifies access to the attachment's calendar
3. Covie creates a short-lived signed private GET URL
4. browser opens that URL

Current download URL lifetime: approximately five minutes.

## File limits

Supporting documents:

- maximum 20 MB

Child profile photos:

- maximum 8 MB

Supported supporting file types:

- PDF
- JPEG
- PNG
- WebP
- HEIC
- HEIF
- Microsoft Word DOC
- Microsoft Word DOCX

Profile photos accept image formats only.

Executables, scripts and archive formats are deliberately not accepted.

## Categories

Supporting-document categories:

- Receipt
- School form
- Medical letter
- Registration
- Camp information
- Insurance
- Other

Profile photos use the dedicated `profile_photo` category and role.

## Database model

Phase 7 introduces:

- `attachment_status`
- `attachment_category`
- `attachment_entity_type`
- `attachment_role`
- `attachments`
- `attachment_links`

Migration:

- `drizzle/0010_attachments.sql`

### attachments

Stores:

- calendar
- storage provider
- private storage key
- original filename
- MIME type
- byte size
- category
- primary target type/id/role
- Pending or Ready state
- uploader
- ready timestamp
- timestamps

The primary target is recorded before the signed upload URL is issued.

### attachment_links

Stores reusable relationships between a Ready attachment and Covie records.

Phase 7 creates the primary link.

Phase 8 can reuse this table when a useful document belongs to more than one connected record.

## Profile photos

Child profile photos use exactly the same private attachment infrastructure.

There is no separate image database, public image URL or base64 field.

Only one Ready profile photo is linked to a child at a time.

When a replacement is finalized:

1. the new private object is verified
2. the old attachment metadata/link is replaced transactionally
3. the old private Blob object is deleted best-effort after the database transaction

If there is no photo, Covie continues to show the child's initials.

## Expense integration

Every agreed Expense can open a **Receipts & documents** panel.

Default category:

- Receipt

The panel is attached only to the agreed Expense row.

A Waiting expense proposal cannot receive attachments because it is not yet an agreed record.

## Responsibility integration

Every agreed Responsibility can open **Documents**.

Useful examples:

- permission form
- registration PDF
- medical instruction
- camp information

Attachments do not change the responsibility's completion or approval model.

## Event integration

Event documents appear in Day Details with the agreed event.

This means both editors and view-only calendar members can open documents linked to an event.

Examples:

- school notice
- tournament draw
- camp itinerary
- appointment letter

Recurring event occurrences share the same underlying event ID, so a supporting file belongs to the agreed series rather than creating duplicate copies for every occurrence.

## Child profile integration

Child profiles now support:

- private profile photo
- supporting Documents section

Examples:

- school enrolment form
- medical letter
- insurance document
- camp details

Child-document and profile-photo changes also appear in that child's Recent Changes.

## Permissions

### Owner / editor

Can:

- list attachments
- upload
- finalize
- download
- remove

### Viewer

Can:

- list Ready attachments
- obtain a short-lived private download link

Cannot:

- prepare uploads
- finalize
- delete

Server-side permission checks remain authoritative regardless of hidden UI controls.

## Approval behavior

Uploading/removing a supporting file is an operational document action.

It does **not** create another approval proposal.

Attachments only exist against an already agreed Expense, Responsibility or Event, or against shared Child reference information.

Pending approval cards do not expose AttachmentPanel.

## Audit behavior

Covie audits:

- attachment upload
- attachment deletion
- child profile photo update/removal
- child document add/removal

Audit data contains useful metadata such as filename/category/target.

It does not contain:

- file bytes
- Blob credentials
- presigned URLs
- document contents

## Google Calendar

Attachments have no Google Calendar mapping.

Uploading, downloading or deleting a file does not:

- create Google Calendar jobs
- modify synced Google events
- add file URLs to Google event text

Google continues to see only agreed calendar/event information from the existing sync system.

## Failure and cleanup behavior

Pending attachment rows are hidden from normal lists.

If client upload/finalization fails, the UI makes a best-effort request to remove the pending attachment.

Removing an attachment deletes its Covie metadata first and then removes the inaccessible private Blob object best-effort.

This prioritizes never leaving a visible Covie record pointing at a deliberately deleted file.

## Remaining production verification

Database migrations through `0012` are already applied. The remaining attachment infrastructure checks are:

1. Confirm a Vercel **Private Blob** store is attached to the active `co-parent-calander` project.
2. Confirm the deployed function has working Blob OIDC/store authentication.
3. Confirm no public Blob store is used for Covie attachments.
4. Confirm signed PUT/GET URLs work from Production.
5. Confirm CORS/browser direct PUT works from the Covie Production domain.
6. Confirm finalize metadata checks and best-effort object deletion work end to end.

## Deployment verification later

After all stages are complete and deployment is explicitly approved, verify:

1. PDF receipt uploads to an agreed Expense.
2. JPEG/PNG/WebP image uploads.
3. DOC/DOCX uploads.
4. Unsupported executable is rejected.
5. Supporting file larger than 20 MB is rejected.
6. Profile photo larger than 8 MB is rejected.
7. Viewer can open a Ready private document.
8. Viewer cannot prepare/upload/delete.
9. Upload URL expires and is scoped to one pathname.
10. Download URL expires.
11. An upload authorized for one record cannot finalize against another.
12. Finalize rejects mismatched size/content type/path.
13. Pending uploads never appear as Ready documents.
14. Expense receipt panel works.
15. Responsibility document panel works.
16. Event file panel appears in Day Details.
17. Child supporting Documents work.
18. Child profile photo displays.
19. Replacing a child profile photo leaves one current photo.
20. Removing a profile photo returns to initials.
21. Child Recent Changes records photo/document changes.
22. Attachment actions appear in Covie Activity.
23. Waiting proposals do not expose attachment uploads.
24. Attachment actions create no approval proposals.
25. Attachment actions create no Google Calendar jobs.
26. Database contains metadata/private storage key only, not file bytes or permanent public URLs.
