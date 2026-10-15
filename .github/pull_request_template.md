<!-- Canonical process: .agents/WORKFLOW.md.
The PR author must supply real verification evidence, not assumptions.
This template does NOT permit an agent to merge or alter unrelated work. -->

## Linked Issue
<!-- When this PR implements a scoped GitHub Issue, link it (e.g. Refs #123).
For migration or multi-PR tracking Issues, avoid auto-close keywords such as Closes/Fixes.
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
- **Summary:**

## Review & handoff
- [ ] PR targets the approved base (normally `main`) from the assigned task branch.
- [ ] Implementation stays within the linked Issue and avoids unrelated changes.
- [ ] Relevant verification evidence is recorded above.
- [ ] Independent Reviewer evaluated the actual PR diff and acceptance criteria, **or** a user-approved review exception is documented (approver, rationale; see .agents/WORKFLOW.md).
- [ ] Orchestrator has reported verdict, blockers and residual risks to the user.

**Merge decision: user only.** Approval, a passing check or a GitHub label does not authorize an agent to merge.
