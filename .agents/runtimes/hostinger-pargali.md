# Hostinger Pargali Preview Adapter — 0xDeck

This adapter maps the shared [preview and merge-readiness contract](../WORKFLOW.md#preview-and-merge-readiness-contract) to the current VPS. It defines operational outcomes for an authorized deployment setup; it does not authorize an agent to edit Caddy, bypass authentication, deploy to production, merge a PR or enable auto-merge.

## Artifact convention

The canonical `main` build remains `/srv/0xdeck/dist` and is never a PR-preview target. Browser-visible PR artifacts use an isolated, immutable directory keyed by PR number and full head SHA:

```text
/srv/0xdeck-previews/pr-<number>/<full-head-sha>/dist/
```

The deployed directory must contain only artifacts built from that exact head. A non-secret `preview.json` in the served artifact root must identify the PR, full head SHA, build time and build/check result so the URL-to-SHA mapping can be verified without credentials. A mutable convenience pointer or route may select the current SHA for a PR, but evidence and review must still name the immutable SHA.

## Routing and access

An authorized VPS operator configures Caddy once to expose the isolated preview root through the existing protected host, using a stable per-PR URL such as `https://<configured-host>/previews/pr-<number>/`. The real configured URL, not the placeholder, belongs in the PR.

- Preserve the existing password gate and access policy. Never publish credentials in the URL, repository, deployment record, logs or handoff.
- Route the preview prefix only to `/srv/0xdeck-previews`; it must never write to or replace `/srv/0xdeck/dist`.
- If the application needs API/WebSocket routing, keep the existing protected upstream behavior unless the Issue explicitly authorizes an isolated backend. A static preview with unavailable backend behavior must record that limitation and cannot satisfy affected acceptance criteria.
- Caddy or host changes are infrastructure work and require explicit user authorization and their own verification. If no verified protected preview route exists, the browser-visible task is **NOT MERGE-READY**; do not fall back to the canonical site.

## Publish and verify

For each current PR head, the Coder or authorized deployment owner:

1. Confirms the worktree is on the PR branch and records the full `git rev-parse HEAD` value.
2. Runs the Issue-required automated checks and builds that head without targeting `/srv/0xdeck/dist`.
3. Publishes the build only to the matching isolated SHA directory and writes its non-secret `preview.json`.
4. Verifies the protected URL is user-openable and that its `preview.json` names the same full SHA.
5. Exercises the browser-relevant acceptance criteria at the URL and records exact results and limitations on the PR.

Every push invalidates earlier preview evidence. Publish a new SHA directory, update the per-PR route/pointer, and repeat verification before review or user handoff. Do not mutate the old SHA directory to represent a different commit.

## Retention and cleanup

The PR must name the person or role responsible for keeping the preview available and for cleanup. Retain the current verified SHA directory and route until the user chooses merge, hold or cancel. After that recorded decision, the owner may remove only the explicitly identified PR preview directory after confirming it is under `/srv/0xdeck-previews/pr-<number>/`; never use a broad or unresolved path and never remove `/srv/0xdeck/dist`.

If the user approves an explicit expiry instead, record the timestamp and resulting availability risk on the PR before applying it. Cleanup of preview artifacts does not close an Issue, merge a PR or delete a Git branch.
