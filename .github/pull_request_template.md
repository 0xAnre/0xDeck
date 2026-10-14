<!-- Canonical process: .agents/WORKFLOW.md.
The PR author must supply real verification evidence, not assumptions.
This template does NOT permit an agent to merge or alter unrelated work. -->

## Linked Issue
<!-- Link to the single assigned implementation Issue (e.g. Refs #123).
For migration or multi-PR tracking Issues, avoid auto-close keywords such as Closes/Fixes. -->

## Summary
<!-- What changed, and why? -->

## Implementation
<!-- Files / key decisions / deviations from Issue scope. -->

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

## Review & handoff
- [ ] PR targets the approved base (normally `main`) from the assigned task branch.
- [ ] Implementation stays within the linked Issue and avoids unrelated changes.
- [ ] Relevant verification evidence is recorded above.
- [ ] Independent Reviewer has evaluated the actual PR diff and acceptance criteria.
- [ ] Orchestrator has reported verdict, blockers and residual risks to the user.

**Merge decision: user only.** Approval, a passing check or a GitHub label does not authorize an agent to merge.
