# Hostinger Pargali Preview Adapter — 0xDeck

This adapter maps the shared [preview and merge-readiness contract](../WORKFLOW.md#preview-and-merge-readiness-contract) to the current VPS. It defines operational outcomes for an authorized deployment setup; it does not authorize an agent to edit Caddy, bypass authentication, deploy to production, merge a PR or enable auto-merge.

## Artifact convention

The canonical `main` build remains `/srv/0xdeck/dist` and is never a PR-preview target. Browser-visible PR artifacts use an isolated, immutable directory keyed by PR number and full head SHA:

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
- Never write to or replace `/srv/0xdeck/dist`.
- If the application needs API/WebSocket routing, keep the existing protected upstream behavior unless the Issue explicitly authorizes an isolated backend. A static preview with unavailable backend behavior must record that limitation and cannot satisfy affected acceptance criteria.
- Caddy or host changes are infrastructure work and require explicit user authorization and their own verification. If neither strategy is configured and verified, the browser-visible task is **NOT MERGE-READY**; do not fall back to the canonical site.

## Publish and verify

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
