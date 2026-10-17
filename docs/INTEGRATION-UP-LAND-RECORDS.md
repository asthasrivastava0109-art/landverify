# UP Bhulekh and UP Bhunaksha: access investigation

Investigated on 17 October 2026 before any connector was written. This records what could and could not be established, and the decision that follows from it.

## What was checked

| Question | UP Bhulekh (upbhulekh.gov.in) | UP Bhunaksha (upbhunaksha.gov.in) |
| --- | --- | --- |
| Official public API or documented data service | An official district page (hapur.nic.in) says a "Bhulekh Data API" exists for other applications. **No public documentation, endpoint list, registration route or terms for it could be found.** Treat it as available only by agreement with the content owner (Board of Revenue, Uttar Pradesh) and the host (NIC UP). | None found. |
| Ordinary browser lookup | Yes. The portal is a JavaScript application. | Yes. The viewer takes district, tehsil, village and plot number, and shows numeric official codes for each (for example a three-digit district code and a six-digit village code). |
| Fields needed | District, tehsil, village, then plot (Gata/Khasra) or Khata/owner, depending on the search type. Exact required fields could not be read from the page, which renders client-side. | District, tehsil, village, plot number. |
| Authentication, CAPTCHA, session checks, rate limits | **Could not be established from here.** Pages render client-side and the workspace cannot browse them like a user. Not assumed absent. | Same. |
| Map service or downloadable map | Not applicable. | **No documented map service, tile endpoint or geometry download was found.** The viewer is the only supported surface identified. |
| Terms | The Bhulekh terms page states that the Board of Revenue owns the content and NIC UP hosts the site, and says external links are provided for convenience. **It does not address automated access, storage, display or reuse.** | No terms page was located. |
| Permission needed for production use | Unresolved. Written permission from the Board of Revenue (and NIC where applicable) should be obtained before any automated access or bulk storage. | Same. |

Not determined: whether either portal permits framing, whether a CAPTCHA appears, and what rate limits apply. Browser-traffic endpoints were deliberately **not** inspected or reused, because an endpoint seen in network traffic is not an approved integration.

## Decision

Per the preference order in the brief (official API, supported lookup or download, authorised agreement, guided manual lookup), none of the first three could be verified. LandVerify therefore implements **option 4: a guided lookup with import**, and nothing that pretends to be live retrieval.

- LandVerify does **not** call UP Bhulekh or UP Bhunaksha servers.
- The user opens the official portal in a new tab, using the property's stored location and plot details (shown with copy buttons).
- The user brings back the record: an uploaded PDF or image, plus the values they read from it, typed in and confirmed.
- Imported material is stored in the private vault and labelled **user-imported official-source material, pending validation**. It is never labelled live, certified or verified by a government service.
- A saved record is a **historical snapshot**. Importing again creates a new snapshot and marks the earlier one as historical.
- Users can record that a record was **not found** or the **portal was unavailable**. These are stored with a timestamp as user-reported outcomes.

## What would change with authorisation

If the Board of Revenue or NIC grants API access, a connector can be added under `server/connectors/` that fills the same tables (`land_records`, `land_record_fields`) with `method = 'api'`. Credentials must live in server environment variables, never in the front end. Nothing else in the product (comparison, findings, reports, review) would need to change.

## Fields supported

Only values the user reads off the official page or document are stored. Nothing is inferred.

- **Revenue record (Bhulekh):** district, tehsil, village, village code, Gata/plot number, Khata number, recorded area with its stated unit, tenure-holder entries, land class, sale or transaction status, dispute or litigation status, record reference, other notes. Original Hindi wording can be kept alongside each value.
- **Cadastral map (Bhunaksha):** district, tehsil, village, village code, plot number, plot area shown, map or sheet reference, adjacent plots, other notes, plus the uploaded map image or PDF.

## Location codes

Official numeric codes are accepted as optional fields (district, tehsil, village). **No code list is bundled**, because a complete verified list was not available. Users copy the codes from the portal's own drop-downs.

## Map display

No authorised geometry exists, so no parcel polygon is drawn from official data and no coordinates are produced. An imported map image or PDF is shown with zoom controls and a note that cadastral maps may contain inaccuracies. The illustrative outline on the property overview remains separately labelled as illustrative.
