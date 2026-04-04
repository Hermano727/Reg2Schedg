# Degree audit planner — product spec (ideation locked)

This document locks decisions from the degree-audit planner ideation review: **source of truth** when inputs disagree, **MVP vs later** scope, and **privacy / retention** aligned with the target stack (Next.js, Supabase Auth + Storage + Postgres RLS, FastAPI worker). It is **not** an official UCSD document; the planner remains **unofficial** and advisory.

---

## 1. Source of truth when PDF and live data disagree

### 1.1 Definitions


| Input                        | Meaning                                                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Audit PDF**                | User-uploaded export (e.g. degree audit / advising report). Point-in-time, may be stale.                                                     |
| **Live snapshot**            | Data retrieved while the user is present (e.g. after Duo), via Browser Use or future official APIs. Represents portal state at capture time. |
| **Catalog / rules snapshot** | TritonHub-held curriculum data (versions, prereqs, offerings). Used for suggestions, not as a substitute for the registrar.                  |


### 1.2 Canonical precedence (merge logic)

1. **Enrollment facts** — Courses shown as completed, in progress, transferred, or repeated; term labels; unit totals that the portal treats as authoritative.
  - **Canonical source:** **Live snapshot** when a capture job completed successfully in the user’s session and passed validation (session marker, checksum, or DOM sanity checks).  
  - **Fallback:** Values extracted from the **Audit PDF** when no valid live snapshot exists for that fact class.
2. **Requirement lines and substitutions** — Complex rows (GE bundles, major-specific electives, waivers).
  - **Canonical source:** **Neither auto-wins.** If live snapshot and PDF (or two PDFs) disagree on the same requirement row, the merge engine sets status `**REVIEW_REQUIRED`** and stores both provenances. The UI must not silently pick one.
3. **Planner-suggested future courses** — Not canonical; always labeled **proposed**. Driven by preferences + graph + catalog snapshot, subject to user edits.
4. **Timestamps** — When both PDF and live exist, persist `pdf_captured_at` (user-provided or inferred) and `live_captured_at`. Show them in the UI for transparency.

### 1.3 Merge algorithm (implementation sketch)

```
For each fact key K in (enrollment_rows, unit_totals, ...):
  if live_snapshot.valid && live_snapshot.has(K):
    canonical[K] = live_snapshot[K]; provenance[K] = "live"
  else if pdf_extract.has(K):
    canonical[K] = pdf_extract[K]; provenance[K] = "pdf"
  else:
    canonical[K] = null; provenance[K] = "missing"

For each requirement row R:
  if live_snapshot.has(R) && pdf_extract.has(R) && !agree(live_snapshot[R], pdf_extract[R]):
    canonical[R] = null; status[R] = REVIEW_REQUIRED; store both blobs for diff UI
  else if live_snapshot.valid && live_snapshot.has(R):
    canonical[R] = live_snapshot[R]; provenance[R] = "live"
  else if pdf_extract.has(R):
    canonical[R] = pdf_extract[R]; provenance[R] = "pdf"
```

`agree()` is strict equality on normalized structured fields (course codes, units, status enums), not raw string match.

### 1.4 User-visible copy (product strings)

Use these verbatim or as close variants so legal and support stay aligned.


| Context                             | Copy                                                                                                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global disclaimer (banner / footer) | **This plan is unofficial.** Your degree audit in **TritonLink / Virtual Advising Center** is the authority. TritonHub does not replace your college or the registrar.  |
| Live + PDF both present             | **We combined your uploaded audit with a fresh snapshot from your session.** Enrollment facts prefer the live snapshot; conflicting requirement lines need your review. |
| Live preferred for enrollment       | **Enrollment and progress** shown here prefer your **latest signed-in session** when available.                                                                         |
| PDF only                            | **Based on your uploaded audit only.** Sign in and refresh to pull the latest from the portal when that feature is available.                                           |
| `REVIEW_REQUIRED`                   | **Mismatch detected** between your file and the portal (or between two sources). Pick the correct row or ask an advisor before relying on this line.                    |
| Proposed courses                    | **Suggested placement only.** Verify prerequisites, enrollment restrictions, and annual catalog changes.                                                                |


---

## 2. MVP scope (v1) vs later (v2+)

### 2.1 Version 1 (ship first)

- **Inputs:** Audit PDF upload; structured preferences (target grad term, learning goals, courses to avoid, instructors to avoid, optional min/max units per term).  
- **Processing:** Parse PDF → normalized **requirement and plan graph** (structured model + LLM slot-filling; rules and caps as code where possible, not free-form only).  
- **Outputs:** Multi-term **proposed** plan, checklist of satisfied / open requirements, **COMPLETE LATER** for unresolved items.  
- **UX:** Editable plan (remove / move courses); edits update derived listings and validation in-app.  
- **Trust:** Disclaimers and provenance labels from §1.4; confidence / review checkpoints for high-impact claims.  
- **Explicitly out of v1:** Unattended Duo; any narrative of “bypassing” SSO; continuous unattended portal sync.

### 2.2 Version 2 (after v1 is stable)

- **Browser Use (optional):** User-present session only; user completes Duo; automation runs only after session is established. Hard timeouts and **detect-and-pause** on DOM/flow breakage—no silent partial merge.  
- **Purpose:** Enrich or refresh enrollment facts and reduce stale PDFs; optional “export fresh PDF” path if parsing quality demands it.  
- **Notifications:** Email or in-app ping (e.g. “TritonHub — complete Duo to continue”) are **UX nudges**, not authentication bypasses.

### 2.3 Exception path

If dogfooding shows **PDF-only quality is insufficient**, prioritize a **minimal** v1.5: “user signs in, we help export one fresh artifact” before full multi-page Browser Use workflows.

---

## 3. Privacy, retention, redaction, Supabase alignment

### 3.1 Data classification

Audit PDFs and extracted fields may contain **FERPA-adjacent** academic and identifying information. Treat as **sensitive user content** at rest and in logs.

### 3.2 Retention (defaults to implement in policy + jobs)


| Data                    | Policy                                                                                                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raw uploaded PDF        | Retain while the **plan workspace is active**; allow user **delete now**. Optional TTL (e.g. **90 days**) after last activity unless user pins “keep for advising.” **Delete on account deletion.** |
| Parsed graph + UI state | Same as user’s saved planner project; cascade delete with account.                                                                                                                                  |
| Logs                    | **No raw PDF bodies** in application logs; structured IDs and error classes only.                                                                                                                   |


Tune TTL with legal review; document final numbers in Supabase / worker config.

### 3.3 Encryption and transport

- **In transit:** HTTPS only (Next ↔ API ↔ Supabase).  
- **At rest:** Supabase Storage and Postgres encryption as provided by the platform; no duplicate cleartext buckets.

### 3.4 Redaction UX

- **Copy:** Recommend uploading **degree-audit pages only**; avoid full SSN or financial aid pages if bundled in a larger export.  
- **Guided redaction:** Optional **client-side** crop/redact before upload (future UI); server-side, treat file as opaque binary unless parsing pipeline runs in a scoped worker.  
- **Support:** If user asks “what to hide,” list: SSN, full DOB if not needed, unrelated financial identifiers.

### 3.5 Supabase Storage + RLS (target)

- **Object keys:** Prefix with `user_id` / tenant id; no world-readable buckets.  
- **RLS:** Policies tied to `**auth.uid()`** (or equivalent) for rows holding metadata (`storage_path`, `plan_id`, `pdf_hash`).  
- **FastAPI:** Verify JWT; only issue signed URLs or proxy downloads for the owning user.

---

## 4. Verification targets (when building)

- Golden tests on **anonymized** real-shaped PDFs (multiple majors/years).  
- Property checks: no duplicate unit counting; prerequisite order; per-term caps from **config**, not LLM prose.  
- Chaos: simulated portal layout change → job **fails loudly**, no silent merge.

---

## 5. Summary table


| Topic                        | Decision                                                       |
| ---------------------------- | -------------------------------------------------------------- |
| Enrollment facts             | Live snapshot when valid; else PDF.                            |
| Conflicting requirement rows | `REVIEW_REQUIRED`; no silent winner.                           |
| Proposed schedule            | Always unofficial; user-editable.                              |
| v1                           | PDF + preferences + graph + UI + disclaimers + COMPLETE LATER. |
| Browser Use                  | v2+; user-present Duo only; optional enrichment.               |
| PDF vs live narrative        | Never “bypass security”; “refresh while you’re signed in.”     |
| Retention                    | User delete + account delete; optional TTL; no PDFs in logs.   |
| Storage                      | Supabase Storage + RLS-by-user.                                |


