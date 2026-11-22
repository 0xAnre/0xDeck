# Hostinger Pargali Deployment Adapter — 0xDeck

This adapter maps the shared [preview and merge-readiness contract](../WORKFLOW.md#preview-and-merge-readiness-contract) to the current VPS. It defines operational outcomes for the configured deployment and records two **separate** user-granted standing authorizations: routine per-PR [preview routing](#standing-authorization-for-routine-task-previews), and [production publishing](#standing-authorization-for-user-confirmed-production-deploys) of a user-confirmed merged `main` state. Neither one authorizes weakening authentication, merging a PR, enabling auto-merge or making unrelated infrastructure changes.

## Standing authorization for routine task previews

The user granted **standing authorization** for routine preview work on the existing configured deck host (source: user instruction recorded on PR #251, comment `7062638053`; codified by Issue #253). Within its scope, do not ask the user for fresh approval on every PR, push or SHA refresh:

- create a per-PR preview route and its immutable `pr-<number>/<full-head-sha>/` artifact directory;
- re-publish and re-point that route to the new current head after each push;
- perform scoped lifecycle cleanup of that PR's preview directory and route after the user's merge, hold or cancel decision, or an explicitly approved expiry.

Scope is the existing protected host and its `/previews/pr-<number>/` prefix only. This standing permission does **not** authorize weakening or bypassing authentication and access policy, disclosing credentials, new hosts or backends, publishing to `/srv/0xdeck/dist` or production, unrelated Caddy or infrastructure edits, merging or auto-merging. Preview work stays preview work: publishing a merged `main` state is authorized only separately, under the [user-confirmed production authorization](#standing-authorization-for-user-confirmed-production-deploys), and everything else still needs its own authorization. A broader action the user already explicitly authorized takes precedence over this section instead of being asked again. Every guardrail below — existing gate/access policy, immutable PR/SHA artifacts and prefix asset isolation, canonical-target protection, exact-head and loaded-asset verification, independent review, backup/validation/rollback of any config change, and retention until the user's decision — remains in force.

## Artifact convention

The canonical `main` build remains `/srv/0xdeck/dist` and is never a PR-preview target; it changes only through a [user-confirmed production publish](#standing-authorization-for-user-confirmed-production-deploys). Browser-visible PR artifacts use an isolated, immutable directory keyed by PR number and full head SHA:

```text
/srv/0xdeck-previews/pr-<number>/<full-head-sha>/dist/
```

The deployed directory must contain only artifacts built from that exact head. A non-secret `preview.json` in the served artifact root must identify the PR, full head SHA, build time, build/check result and asset-isolation strategy. A mutable convenience pointer or route may select the current SHA for a PR, but evidence and review must still name the immutable SHA. The marker is supporting evidence only: it cannot prove which JavaScript or CSS the browser loaded.

## Routing and asset isolation

An authorized VPS operator must configure one of these protected strategies. Record the chosen strategy and real URL on the PR.

### Same-host preview prefix

Use a stable per-PR prefix such as `https://<configured-host>/previews/pr-<number>/`.

- Build with the Vite `base` set to that exact pathname, including its trailing slash. Generated HTML script, stylesheet, icon and other asset URLs must resolve beneath the same preview prefix.
- Route that prefix only to the selected PR/SHA artifact directory, with any single-page-app fallback contained inside that directory.
- Do not allow preview requests to fall through to the canonical host root. A build that emits `/assets/...` or other root-absolute application assets is invalid for this strategy because the browser could load `/srv/0xdeck/dist`.

### Dedicated protected preview host

Use a dedicated protected hostname whose `/` is rooted only at the selected PR/SHA artifact directory.

- The hostname must not share a document root or fallback with the canonical deployment, so root-absolute `/assets/...` requests still resolve only to the preview artifact.
- Preserve the existing access policy on the dedicated host and record the exact hostname-to-artifact mapping in deployment evidence.

For both strategies:

- Preserve the existing password gate and access policy. Never publish credentials in the URL, repository, deployment record, logs or handoff.
- Never write to or replace `/srv/0xdeck/dist` to publish a preview; production publishing has its own authorization and procedure.
- If the application needs API/WebSocket routing, keep the existing protected upstream behavior unless the Issue explicitly authorizes an isolated backend. A static preview with unavailable backend behavior must record that limitation and cannot satisfy affected acceptance criteria.
- Caddy or host changes outside the [standing authorization](#standing-authorization-for-routine-task-previews) are infrastructure work and require explicit user authorization and their own verification. If neither strategy is configured and verified, the browser-visible task is **NOT MERGE-READY**; do not fall back to the canonical site.

## Publish and verify previews

For each current PR head, the Coder or authorized deployment owner:

1. Confirms the worktree is on the PR branch and records the full `git rev-parse HEAD` value.
2. Chooses and records one asset-isolation strategy. For a same-host prefix, builds with the exact matching Vite `base`; for a dedicated host, verifies its root and fallbacks are confined to the selected SHA artifact.
3. Runs the Issue-required automated checks and builds that head without targeting `/srv/0xdeck/dist`.
4. Inspects generated HTML before publishing. Script, stylesheet, icon and other browser-delivered asset URLs must resolve within the chosen preview prefix or dedicated host; reject root-absolute URLs under the same-host strategy.
5. Publishes the build only to the matching isolated SHA directory and writes its non-secret `preview.json`.
6. Verifies the protected URL is user-openable and that its `preview.json` names the same full SHA and strategy.
7. Captures browser/network evidence for every loaded JavaScript and CSS resource: the requested URL must stay beneath the approved preview prefix or on the dedicated preview hostname, and the served response checksum must match the corresponding file in the immutable SHA artifact directory. Record any other acceptance-relevant asset requests and confirm they follow the same boundary. A preview page that loads canonical-root assets fails verification even when `preview.json` is correct.
8. Exercises the browser-relevant acceptance criteria at the URL and records exact results and limitations on the PR.

Every push invalidates earlier preview and asset-origin evidence. Publish a new SHA directory, update the per-PR route/pointer, and repeat all verification before review or user handoff. Do not mutate the old SHA directory to represent a different commit.

## Retention and cleanup

The PR must name the person or role responsible for keeping the preview available and for cleanup. Retain the current verified SHA directory and route until the user chooses merge, hold or cancel. After that recorded decision, the owner may remove only the explicitly identified PR preview directory after confirming it is under `/srv/0xdeck-previews/pr-<number>/`; never use a broad or unresolved path and never remove `/srv/0xdeck/dist`.

If the user approves an explicit expiry instead, record the timestamp and resulting availability risk on the PR before applying it. Cleanup of preview artifacts does not close an Issue, merge a PR or delete a Git branch.

## Standing authorization for user-confirmed production deploys

The user added a **separate standing authorization** for production: once the user reports that a task PR is merged, publish that merged `main` state to the existing production site without asking for that permission again (source: user instruction recorded on Issue #256). This section records the authorization and its conditions; it does not create it. The authorization is active whenever the user gives it, including before this document reaches `main`, and it is independent of the [preview authorization](#standing-authorization-for-routine-task-previews) above.

### Trigger: a user report or user instruction

Only the user's own statement that a specific PR is merged, or an explicit user instruction to deploy it, starts production work. GitHub `pull_request`/`push` events, webhooks, PR comments, bot mentions, labels, merged-PR notifications and an agent noticing that some PR was merged are **not** triggers, and a merged PR the user did not report in the current task is not a deployment task. Do not scan `origin/main` for work to publish.

### Preconditions: verified before publishing

1. **Actual merge.** The reported PR is `MERGED` — not merely closed, and not approved-and-open — and its merge commit is contained in `origin/main`. Record the PR number and the full merged commit SHA.
2. **Same-head gates.** The required checks passed and an independent review approved that same head. A merge that happened with a failing, missing or superseded head is a stop condition, not an implicit override.
3. **Exact target.** Publish that merged commit and nothing else: no unmerged branch, other PR head, cherry-pick or unrelated later commit, and no blanket deployment of unrelated merged work.
4. **No collateral change.** The deploy changes only the built frontend artifact. The existing password gate and access policy, backend service, API and WebSocket upstream, Caddy routing, hosts and ports stay as they are; anything else is unrelated infrastructure that needs its own authorization.

### Procedure that stays in force

The authorization removes repeated permission questions, not the existing safety steps. Under the current convention on this host:

- **Stage** the exact merged commit outside the served root, under `/srv/0xdeck-prod-stage/<full-sha>/dist/`, with a manifest and a non-secret release record naming the target SHA, the previous state, the backup path and the verification performed.
- **Back up** the live `/srv/0xdeck/dist` and its manifest before replacing anything, under a recorded path such as `/srv/0xdeck-prod-backup/<timestamp>-<previous-index-sha256>/`, and record the rollback step for that backup.
- **Publish safely** from the staged artifact: copy new hashed assets and root statics first, keep the previous hashed assets in place, and replace `index.html` last and atomically, so an interrupted or partial publish never serves a half-built site.
- **Verify what is actually served** at the protected production URL: `index.html` and every loaded JavaScript, CSS, icon and font must return `200` and match the staged artifact by checksum, with no preview-prefix or external asset origin. Record the URL, deployed SHA, exact checks, results and verification time in the PR or Issue.
- **Preserve user state and access.** Never remove or bypass the password gate, never publish credentials in URLs, files, logs or handoffs, and do not change the site origin or wipe browser-stored preferences (theme, candle colors, workspaces, widget settings).

### Stop conditions versus permission questions

Real failures are reported, not converted into a new request for permission: the PR is not actually merged, the merged commit is not on `origin/main`, same-head checks or independent review are missing or red, staging, backup, publish or served-artifact verification fails, served checksums do not match the staged artifact, or completing the deploy would require touching auth, backend, Caddy, hosts or unrelated infrastructure. Stop before changing production, keep the backup and staged artifacts, and report the drift and the current production state. When the user's report and the preconditions do hold, do not ask again for a permission this section already grants.

### Not authorized by this section

This section does not authorize an agent to merge or enable auto-merge, to publish unmerged commits or an unmerged head, to weaken, bypass or remove authentication or access policy, to change unrelated infrastructure, or to deploy a commit the user did not report. Those still need their own explicit authorization, and a failure here never expands the authority granted above.
