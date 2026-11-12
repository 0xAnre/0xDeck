<!-- Canonical process: .agents/WORKFLOW.md.
The PR author must supply real verification evidence, not assumptions.
This template does NOT permit an agent to merge or alter unrelated work. -->

## Linked Issue
<!-- When this PR implements a scoped task Issue, use Closes #<issue-number>.
Use Refs #<issue-number> only for migration or multi-PR tracking Issues that must remain open.
If no dedicated Issue exists for a small authorized change, write **N/A** and a brief rationale (see .agents/WORKFLOW.md — whether every tiny change needs its own Issue is not fixed policy). -->

## Task reference
- **Branch:**
- **Head commit:**

## Summary
<!-- What changed, and why? -->

## Implementation
<!-- Files / key decisions / deviations from Issue scope. -->

## Tests changed
<!-- New or updated automated tests; write "None" if not applicable. -->

## Verification
<!-- For each, enter PASS / FAIL / NOT RUN and a short note or log link.
For docs-only PRs, mark application tests NOT RUN (docs-only). -->

| Check | Result | Evidence / reason |
| --- | --- | --- |
| `npm run build` | NOT RUN | |
| `npm run lint` | NOT RUN | |
| `npm run test:market` | NOT RUN | |
| `npm run test:navigation` | NOT RUN | |
| Backend `python -m unittest discover -s tests` | NOT RUN | |
| Manual UI / browser check (when needed) | NOT RUN | |

## User-testable preview
- **Applicability:** Required for browser-visible work / N/A
- **N/A reason:** <!-- Required when N/A; identify why no rendered browser behavior or asset changes. -->
- **Preview URL:**
- **Deployed head SHA:**
- **Coder verification:** <!-- Exact browser checks/results plus verification time or run reference. -->
- **Retention/cleanup/expiry owner:** <!-- Keep available until the user chooses merge, hold or cancel. -->

<!-- A required preview must be isolated from canonical main output, user-openable under existing
access controls, and refreshed after every push. Never include credentials in the URL or evidence. -->

## Acceptance criteria
<!-- Which Issue criteria passed? Which remain unverified? -->

## Risk / limitations
<!-- Regression risks, unresolved problems, untested paths; write "None known" if appropriate. -->

## Blockers
<!-- Open issues preventing merge or further implementation; write "None" when clear. -->

## Review findings
<!-- Reviewer verdict and summary. Put durable, actionable defect notes in GitHub PR review comments; link threads here.
Per defect: severity, file/line or location, user impact, suggested correction. Separate proven defects from questions. -->
- **Reviewer verdict:** Pending / Changes requested / Approved for user decision
- **Reviewed head SHA:**
- **Preview/head correspondence:** Pending / PASS / FAIL / N/A with concrete reason
- **Preview acceptance checks and limitations:**
- **Summary:**

## Merge readiness
- **Conclusion:** NOT MERGE-READY / MERGE-READY
- **Evidence/blockers:** <!-- Required checks, current-head preview and independent review must all pass for browser-visible work. -->

## Review & handoff
- [ ] PR targets the approved base (normally `main`) from the assigned task branch.
- [ ] Implementation stays within the linked Issue and avoids unrelated changes.
- [ ] Relevant verification evidence is recorded above.
- [ ] Required preview is verified against the current head, or preview N/A has a concrete non-browser reason.
- [ ] Independent Reviewer evaluated the actual PR diff and acceptance criteria. A review exception is invalid for browser-visible work; any user-approved exception for non-browser work is documented with approver and rationale.
- [ ] Orchestrator has reported the preview URL when required, verdict, blockers, residual risks and exactly one merge-ready/not-ready conclusion to the user.

**Merge decision: user only.** Approval, a passing check or a GitHub label does not authorize an agent to merge.
