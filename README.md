# LandVerify

Land due diligence for India. Organise documents, record checks, see what is unresolved, and produce a report that states its own limits.

## Run it

Requires Node 22.5 or newer.

```bash
npm install
npm run build
npm start            # http://localhost:8787
```

For development with hot reload: `npm run dev` (app on :5173, API on :8787).

Data lives in `./data` (SQLite database plus private `uploads/` and `reports/`). Set `LANDVERIFY_DATA` to move it (the old `BHUVERIFY_DATA` name still works, and an existing `bhuverify.db` is renamed automatically), and `PORT` to change the port.
Sign up to create a workspace, then choose **Load demonstration property** on the overview to see a finished file. Every record in it is fictional.

## What works

- Accounts, sessions (HttpOnly cookie), password hashing (scrypt), login throttling
- Workspaces with roles: admin, reviewer, member, viewer. Every query is scoped to the workspace
- Property create, read, update, delete, with search and filters
- Private document upload (PDF, PNG, JPG, TIFF, 25 MB), authenticated retrieval, version history
- Split-view document page with manually entered fields, source locations, and cross-document difference flags
- State-aware checklists in seven groups. A check cannot be completed without a source, evidence and a recorded outcome
- Findings with severity, owner, evidence, next step, and a required reason to resolve
- Reviews: comments, evidence requests, correction requests, decisions, internal stage approvals
- Append-only audit log (enforced by database triggers)
- PDF report with scope, evidence, sources, findings, review history, limitations and unresolved questions

## What does not exist yet, on purpose

- **No OCR or automatic extraction.** Fields are typed by people and stay "Preliminary" until confirmed.
- **No government integration.** UP land-record and registration integrations are listed as "not configured". Nothing is marked as checked unless a person recorded the check and its source.
- **No boundary data.** Parcel outlines are illustrative and labelled so.
- **No stamp-duty, registration or transaction services.** The Transaction Readiness page says so.
- Internal approvals are never described as legal certification.

## Adding a state

Edit `server/jurisdictions.js`. Each state defines its identifier fields, area units, record terminology, integration list and check overrides. UI labels and the generated checklist follow from it.

## Before real use

- Serve over HTTPS (set `NODE_ENV=production` so the session cookie is `Secure`) and put the app behind a reverse proxy
- Back up `./data`; uploaded deeds are sensitive. Consider encrypting the volume
- `node:sqlite` is marked experimental in Node. For multi-instance or larger deployments, move the same schema to Postgres (for example Supabase) and object storage with private buckets; the API layer in `server/index.js` is the only code that touches the database
- Add email verification and password reset, and have counsel review the privacy and terms text
- Have a lawyer review the report wording for your use case

## UP Bhulekh and UP Bhunaksha (Maps & land records)

For Uttar Pradesh properties, the **Maps & records** tab supports a guided lookup and import of revenue records (UP Bhulekh) and cadastral maps (UP Bhunaksha).

- LandVerify does **not** call either portal. No public API or terms permitting automation could be verified. See `docs/INTEGRATION-UP-LAND-RECORDS.md`.
- A person looks the record up on the official site, then imports the file and/or typed values. Everything is labelled user-imported, pending validation, with source link, lookup date, import time, importer and "no changes made".
- Compare sources checks identity, Khata, area, owner and statuses, with outcomes Match / Potential discrepancy / Source unavailable / Manual review required / Record could not be matched / Outdated. Discrepancies raise findings automatically (deduplicated). Reviewers can confirm after checking (not a legal conclusion).
- Units are never converted. Names are compared as text only.
- If authorised API access is granted, add a connector writing to `land_records` with `method = 'api'`; credentials stay in server environment variables.
