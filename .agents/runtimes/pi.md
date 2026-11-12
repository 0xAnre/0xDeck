# Pi Runtime Adapter — 0xDeck

This is a **runtime-specific** deployment guide for the first implementation of the agent-agnostic [workflow](../WORKFLOW.md) and [role contracts](../roles/). Pi is one possible runtime; shared role definitions **must not** depend on it. The shared workflow does not assume a fixed number of Coder slots; this adapter records the verified VPS deployment (three Coder slots) and the historical Mac migration.

> This document does not configure the user's Mac by itself. Its sample paths must be checked against the actual machine. Do not treat deployment examples as permissions to edit user machines, merge PRs or trigger agents.

## Historical verified environment (2026-10-14, Mac)

This table is the historical Mac starting point, not the current VPS inventory. The VPS three-Coder deployment is documented below.

User-provided Mac terminal evidence:

| Component | Current value |
| --- | --- |
| Pi | `0.87.1`, executable at `~/.local/bin/pi` |
| Installed subagent package | `git:github.com/edxeth/pi-subagents` (via `pi list`) |
| Parent/team workspace | `~/pi-0xdeck-team` |
| Existing child specs | `~/pi-0xdeck-team/.pi/agents/{coder,coder-2,reviewer}.md` |
| Main/reviewer repository | `~/Documents/0xdeck-pi` |
| Coder worktrees | `~/Documents/0xdeck-pi-wt1`, `~/Documents/0xdeck-pi-wt2` |

The local team workspace already contains `AGENTS.md`, `ORCHESTRATOR.md`, `CODER.md`, `REVIEWER.md`, `PROJECT-GUIDE.md`, and `GITHUB-WORKFLOW.md`. Their old copies include legacy team-specific routing and overlapping policies. They are **migration sources**, not continuing sources of truth.

## Runtime behavior that matters

The installed package is [edxeth/pi-subagents](https://github.com/edxeth/pi-subagents); do **not** install another fork with a similar name.

Its documented agent locations are project `.pi/agents/` and global `~/.pi/agent/agents/`. Child agent frontmatter supports:

- `name`, `description`, `mode: background` for discrete named children.
- `cwd` to bind child execution to its assigned worktree.
- `no-context-files`: when **true**, the child skips discovery of repository `AGENTS.md` and other project context files.
- `flags` to supply extra Pi CLI arguments, including `--append-system-prompt <file>`.
- `tools` and `deny-tools` as tool selection; tool selection does not create OS or GitHub permission isolation.
- `session-mode` to control context lineage; choose fresh/isolated review context, not a Coder conversation fork.

The package supports a global `PI_ORCHESTRATOR_MODE=1`, but it removes ordinary read/bash/write tools and permits only delegation tools. **Do not enable it for this workflow by default:** our Orchestrator must still inspect and update GitHub Issues and PR state. Revisit only if GitHub updates are handled by a separately controlled tool/worker.

## Target ownership: shared contract vs Pi adapter

| Shared, versioned in the 0xDeck repo | Specific to this Mac / Pi |
| --- | --- |
| `AGENTS.md` — technical project context | `~/pi-0xdeck-team/AGENTS.md` — top-level Pi bootstrap |
| `.agents/WORKFLOW.md` — state transitions & handoffs | Pi child definitions in `~/pi-0xdeck-team/.pi/agents/` |
| `.agents/roles/orchestrator.md` | Parent Pi session model/tools/launcher |
| `.agents/roles/coder.md` | Coder slot CWDs and agent launch metadata (all configured slots; paths stay in the adapter) |
| `.agents/roles/reviewer.md` | Reviewer CWD and appropriately scoped review tools |
| `.agents/roles/principal-engineer.md` | Optional agent selected by user; **do not** auto-register a trigger |

No copying of long workflow or role prompts into child definitions. The adapter points each session to the appropriate shared documents.

## Suggested Mac migration (perform **after** the documentation PR merges)

1. **Verify state:** `git -C ~/Documents/0xdeck-pi status --short --branch`, `git -C ~/Documents/0xdeck-pi worktree list`, `pi list`. Do not clean, reset or delete existing worktrees automatically.
2. **Back up the current local team workspace files** and child agent definitions with a timestamped copy before editing. Preserve an inventory/rollback record; this is a new runtime setup, not compatibility with the retired workflow.
3. **Update the local main repo** to the merged `main` **only after** verifying the working tree is clean; then ensure each Coder worktree has the shared docs available on its task branch before launching a job. A Coder branch from an older `main` does not automatically inherit newly merged docs.
4. **Top-level Orchestrator:** simplify the local `~/pi-0xdeck-team/AGENTS.md` into a small Pi bootstrap that explicitly points to the repo's `AGENTS.md`, `.agents/WORKFLOW.md`, and `.agents/roles/orchestrator.md`. Replace obsolete local policy copies rather than retaining them as conflicting instructions.
5. **Coders:** preserve the existing child names and separate worktree CWDs. Prefer `no-context-files: false` so each child loads the **new shared repo `AGENTS.md`** from its own CWD. Explicitly supply or instruct the child to read `.agents/WORKFLOW.md` and `.agents/roles/coder.md` at startup. Using `flags: --append-system-prompt <file>` is one supported option, provided the file exists at that exact worktree path when invoked. Add another Coder child only after its own clean worktree, role prompt and credentials are verified; a directory alone is not a slot.
6. **Reviewer:** preserve its dedicated child name and `cwd` on the main/reviewer repo. Load the repo `AGENTS.md`, workflow and shared Reviewer contract. Use a fresh child context; review only the actual Issue/PR/diff/test evidence. Limit tool capability as far as the chosen review mechanism permits; a generic `bash` tool with full `gh` credentials is **not** hard read-only enforcement.
7. **Principal Engineer:** do not create an automatic Pi or GitHub trigger. The user explicitly chooses whether and when to consult Codex (or a replacement agent).
8. **Smoke test:** in a non-mutating task, confirm the top-level Pi sees the new workflow, every configured Coder definition is discoverable (the VPS deployment below has three), and Reviewer has the expected shared contract; do not create Issues/PRs or start coding. Then test the full pipeline on one low-risk implementation task and document the result in the migration Issue.

## Minimal child adapter shape (illustrative only)

This example is **not ready to copy verbatim**. Replace the path and preserve the actual worktree assignment and runtime settings verified on the Mac.

```markdown
---
name: coder
description: Implements a GitHub Issue as the Coder role
mode: background
cwd: /absolute/path/to/0xdeck-pi-wt1
no-context-files: false
---

You are the Coder. Before making changes, read:
1. AGENTS.md (technical 0xDeck rules)
2. .agents/WORKFLOW.md (shared lifecycle)
3. .agents/roles/coder.md (your role contract)

Follow the assigned Issue, branch and worktree. Report the PR link,
tests actually run, and blockers to the Orchestrator. Never merge.
```

Use the equivalent adapter for every additional Coder slot (`coder-2`, `coder-3`, …) with its own worktree CWD, and for `reviewer` with the Reviewer contract and **no write mandate**. Never share a worktree or an active branch between slots. Agent definitions remain short; repeat neither the old local `GITHUB-WORKFLOW.md` nor legacy isolation instructions.

## Verified VPS deployment — three Coder slots (audited 2026-11-12)

This section is the runtime-specific inventory for `hostinger-pargali`. The shared [workflow](../WORKFLOW.md) and [role contracts](../roles/) deliberately do not name slot counts, paths, launchers or credentials; this adapter does. Everything below was observed on the VPS on 2026-11-12; anything that could not be verified is marked as such.

### Audit method

Read-only. No token, key or secret is reproduced here. Commands ran in `/srv/0xdeck-wt3` and in the canonical `/srv/0xdeck` with the coder-3 role environment sourced from `~/.config/0xdeck-agent-app/roles/coder-3/env.sh`. `/srv/0xdeck-wt1` and `origin/team/wt3` were only read.

### Why the third Coder exists

**Never removed, never temporary, and never described in this repository.**

- A third Coder is not new. Before the VPS team, three implementer identities were already committing: `0xdeck-pi-coder[bot]` (35 commits), `0xdeck-pi-coder-2[bot]` (69) and `0xdeck-pi-coder-3[bot]` (20, latest 2026-10-28). `git log --all --format='%an' | sort | uniq -c`.
- The repository never named it. `git log --all -S"coder-3" -- .agents docs AGENTS.md` and `git log --all -S"wt3"` return nothing. `.agents/runtimes/pi.md` was added by `e2c1a05` and documents only the Mac `coder`/`coder-2` children; it was simply never updated after the VPS migration.
- The current definition lives outside the repository: `~/.config/0xdeck-agent-app` (created 2026-11-02 08:46), `roles/coder-3/` (created 2026-11-02 10:57, 17 minutes after `roles/coder-1` and `roles/coder-2`), `roles/coder-3.gitconfig`, `cache/coder-3.json`, and the Pi prompt template `~/.pi/agent/prompts/coder-3.md` (2026-11-02 10:57).
- `/srv/0xdeck-wt3` was used for exactly one cancelled task: PR #215 (`feat(chart): optional developing VAH/VAL and POC render mode for the FRVP`), head `team/wt3`, base `main`, author `app/0xdeck-vps`, state `CLOSED` at 2026-11-06T01:56:18Z, `mergedAt: null`, head `66fe123`. `origin/main..origin/team/wt3` holds five commits, all authored `0xdeck-vps-coder-3[bot]`. The remote branch still exists as the unmerged record of that cancelled PR.
- The slot was therefore idle, not retired. What it lacked was a documented assignment rule, which this change adds.

### Inventory

| Slot | Worktree | Role prompt | Declared commit author | GitHub credential |
| --- | --- | --- | --- | --- |
| Coder 1 | `/srv/0xdeck-wt1` | `~/.config/0xdeck-agent-app/roles/coder-1/role.md` | `0xdeck-vps-coder-1[bot]` | role-scoped installation token |
| Coder 2 | `/srv/0xdeck-wt2` | `~/.config/0xdeck-agent-app/roles/coder-2/role.md` | `0xdeck-vps-coder-2[bot]` | role-scoped installation token |
| Coder 3 | `/srv/0xdeck-wt3` | `~/.config/0xdeck-agent-app/roles/coder-3/role.md` | `0xdeck-vps-coder-3[bot]` | role-scoped installation token |

`bin/setup-roles.sh` generates those identities (`coder-1|coder-2|coder-3) BOT="0xdeck-vps-$ROLE[bot]"`). The author string is a git `user.name`/`user.email` convention, **not** a GitHub account: there is no per-Coder GitHub user. Pushes and PRs authenticate as the App installation and appear as `app/0xdeck-vps` (PR #215 author; `gh auth status` → account `0xdeck-vps[bot]`).

All three slots load the same project context and shared contract: `AGENTS.md`, `.agents/WORKFLOW.md`, `.agents/roles/coder.md`. Their role prompts contain only runtime wiring (worktree, identity, reporting line, branch rules) plus a pointer to the shared contract — not a second copy of the workflow. Orchestrator, Reviewer and the on-demand Principal Engineer remain separate roles. Coder 3 has no Reviewer or Orchestrator authority.

### Launcher and role loading

- `/usr/local/bin/deck-role <role>` (755, 2026-11-03 03:26) maps `orchestrator|reviewer|principal-engineer` → `/srv/0xdeck` and `coder-1|coder-2|coder-3` → `/srv/0xdeck-wt1|wt2|wt3`; an unknown role exits 2.
- It fast-forwards the worktree to `origin/main` only when `git status --porcelain` is empty **and** `HEAD` is an ancestor of `origin/main` (`sync_worktree`). A dirty tree or an unmerged branch is reported and left untouched. Observed on launch: `worktree(coder-3) = 08e027d (origin/main)`.
- It starts `hc run --bg --name <role> --cwd <worktree> -- bash -lc ". <role>/env.sh; exec pi --append-system-prompt <role>/role.md"`. Observed coder-3 terminal argv: `bash -lc . '/root/.config/0xdeck-agent-app/roles/coder-3/env.sh'; exec pi --append-system-prompt '/root/.config/0xdeck-agent-app/roles/coder-3/role.md'`, cwd `/srv/0xdeck-wt3`.
- `pi` starts in the worktree, so its project-context discovery loads that worktree's `AGENTS.md`; `--append-system-prompt` loads the role prompt, which points at the canonical `/srv/0xdeck/AGENTS.md`, `.agents/WORKFLOW.md` and `.agents/roles/coder.md`.
- `/usr/local/bin/deck-team` loops `coder-1 coder-2 coder-3 reviewer`; both launchers are idempotent per role.
- Cosmetic inconsistency, not a functional gap: the usage comment on line 2 of `deck-role` still lists `orchestrator|coder-1|coder-2|reviewer` while the `case` accepts `coder-3` and `principal-engineer`.

### Credentials and what is actually enforced

Tokens are minted per invocation: `roles/coder-3/bin/gh` and `bin/git-credential-0xdeck` call `bin/mint-installation-token.sh coder-3`, which signs a short-lived App JWT from the 0600 key and requests a one-hour installation token downscoped to `contents: write`, `pull_requests: write`, `issues: read`, `metadata: read` for repository `0xDeck` only. The token is cached `0600` per role for about 55 minutes; no long-lived token is stored in an env file, the repository or the role prompt.

| Check | Result (2026-11-12) |
| --- | --- |
| Token identity | `gh auth status` → `0xdeck-vps[bot]`, `GH_TOKEN` installation token |
| Repository scope | `gh api /installation/repositories` → only `0xAnre/0xDeck` |
| Read access | `gh api repos/0xAnre/0xDeck/contents/AGENTS.md` → 25999 bytes |
| `gh api user` | `403 Resource not accessible by integration`; expected for an installation token, never used as identity evidence |
| Contents write | `git push --dry-run origin HEAD:refs/heads/tmp-wt3-audit-probe` accepted (`* [new branch]`); `git ls-remote` before and after → no ref created |
| Issue write denied | `POST /repos/0xAnre/0xDeck/issues/228/comments` → `403 Resource not accessible by integration`; nothing was created |
| Merge **not** denied | `PUT /repos/0xAnre/0xDeck/pulls/215/merge` → `405` (base branch modified / PR not mergeable), **not** `403`. The authorization was accepted |

The last row matters: a `pull_requests: write` token can merge a mergeable PR and is the same permission that enables auto-merge. **The user-only merge rule and the no-auto-merge rule are contractual, not credential-enforced.** All three Coder roles share this profile, so Coder 3 adds no new capability class — but it does add one more agent that mechanically *could* merge. Do not describe this token as read-only or merge-proof; do not claim technical enforcement that does not exist.

The repository ruleset `Protect main — user merge only` (id `25076079`, enforcement `active`, created 2026-10-14) blocks deletion and non-fast-forward updates and requires changes to reach `main` through a pull request, but it requires **0** approving reviews and has no required reviewers — so it does not stop a holder of `pull_requests: write` from merging a PR. Changing the ruleset or adding required reviews is repository/infrastructure policy and is out of scope here.

### Commit authorship is currently overridden (open item, not changed here)

- The role `.gitconfig` declares `0xdeck-vps-coder-3[bot] <0xdeck-vps-coder-3@users.noreply.github.com>`, but repository-local config outranks `GIT_CONFIG_GLOBAL`.
- `/srv/0xdeck/.git/config` — shared by every worktree, modified 2026-11-12 05:47 — contains `[user] name = 0xAnre`, `email = 299732504+0xAnre@users.noreply.github.com`.
- Observed with the role environment sourced: `git var GIT_AUTHOR_IDENT` in `/srv/0xdeck-wt3` → `0xAnre <299732504+0xAnre@users.noreply.github.com>`; the same command in `/srv/0xdeck-wt1` with coder-1's env → identical. A Coder 3 commit today would therefore be authored as the user, not the declared bot string.
- This is shared state that affects every slot and the canonical repo, so this change does not alter it. Recommended fix, owned by the user: remove the `[user]` block from `/srv/0xdeck/.git/config` so each role resolves to its own `.gitconfig`, or set the identity per invocation. Until then, do not use commit authorship to decide which slot produced a change; use the PR author (`app/0xdeck-vps`), the branch and the handoff record.
- Decide that fix together with the ruleset: the declared bot author strings are **not** GitHub accounts, so commits authored that way are *unattributed* (`authors.user: null` via GraphQL), and the active ruleset sets `require_extra_approval_for_unattributed_changes: true`. The two commits of this change are unattributed and the PR reports `mergeStateStatus: BLOCKED` with both checks green; the user is a bypass actor with `pull_request` mode, so the user can still merge. Restoring bot authorship without adjusting that rule would make agent PRs permanently blocked.

### Branch ownership and assignment

- A slot is a worktree directory, not a permanent branch. The Issue assigns the task branch, created from current `origin/main`.
- `origin/team/wt3` is the closed PR #215 record (five commits, never merged, user-cancelled). Do not check it out, reset it, force-push it, delete it or extend it. A new Coder 3 task uses a new Issue-assigned branch from `main`.
- One slot has at most one active task/PR at a time; never share a worktree or an active branch between slots.
- Coder 1 and Coder 2 role prompts (2026-11-02) still name `team/wt1`/`team/wt2` as their branches; only coder-3's prompt was corrected. Do not extend the old permanent-branch pattern to new slots.
- Preflight before assigning any slot (any failure is a stop condition, never a cleanup target):

```sh
git -C <worktree> status --porcelain          # must be empty
git -C <worktree> rev-parse HEAD              # record it
git -C <worktree> rev-parse --abbrev-ref HEAD # HEAD = detached at origin/main, or the assigned branch
git -C <worktree> log --oneline origin/main..HEAD  # empty unless the assigned task
gh pr list --head <task-branch> --state all   # no open PR already owns the branch
```

Between tasks a slot may sit detached at `origin/main`; that is clean and safe for a new branch. Never reset, stash or discard to make a check pass. The Orchestrator must not assign Coder 3 until this preflight passes.

### Housekeeping and stop conditions

- Fast-forward canonical `main` only; never force or rewrite history.
- Prepare every configured Coder worktree from current `origin/main` only when it is clean and its ownership is clear. `deck-role`'s `sync_worktree` implements exactly that: a dirty worktree is reported and started as-is, never reset.
- Do not delete remote branches. `origin/team/wt3` stays as the closed-PR record. Delete only local branches verified merged into `origin/main` and not checked out anywhere.
- Stop and report if: the worktree is dirty; HEAD carries unmerged work that is not the new task; an open PR already belongs to the slot; the role prompt, `env.sh`, `bin/gh` or the mint script is missing or fails; the identity is not the App installation token or its scope differs from the table above; enabling the slot would need a retired trigger, webhook or credential; or the work would touch another slot's branch or worktree.
- The user alone merges; never enable auto-merge.

### Non-mutating smoke test (2026-11-12)

`deck-role coder-3` printed `worktree(coder-3) = 08e027d (origin/main)` and started terminal `t56` (cwd `/srv/0xdeck-wt3`, detached, `pi` 1.5.0, model `deepseek-v4.1-flash`). The prompt was read-only: do not modify files, commit, push or create/comment/close any Issue or PR; do not start an implementation task; answer five checks and print `SMOKE-DONE`.

Coder 3 answered:

1. first heading `# 0xDeck — Agent Guide`, read from `/srv/0xdeck/AGENTS.md`;
2. merge rule: "Only the user merges to `main`. Agents never merge or enable auto-merge." (AGENTS.md and WORKFLOW.md);
3. contract `/srv/0xdeck/.agents/roles/coder.md`, preceded by `AGENTS.md` and `.agents/WORKFLOW.md`;
4. worktree `/srv/0xdeck-wt3`, detached HEAD `08e027d2432aa1a2d8382f7a96a61b392a70ab2e` = `origin/main`, "no changes made";
5. an unassigned Issue → stop, do not implement, commit or open a PR, report the mismatch, and never infer authorization from a message or GitHub event.

After the run: `git -C /srv/0xdeck-wt3 status --porcelain` empty, HEAD unchanged at `08e027d`, no commit and no push, the only write attempt was the rejected issue-comment probe (`403`, nothing created), and terminal `t56` was killed (`state: finished`, live terminals 0). No dev server was started.

### Runtime change recorded by this audit (outside the repo)

The coder-3 role prompt previously named `team/wt3` as the slot's permanent branch. Because that branch is the closed PR #215 record, the runtime prompt was corrected on 2026-11-12T06:09:46Z to require an Issue-assigned branch from current `origin/main` and to leave `origin/team/wt3` untouched. Backup: `/root/backups/coder-3-role.md.20261112T060946Z`. This change is runtime-specific, is not part of the repository diff, and is recorded here and on the PR so the decision stays auditable.

### Decision

Enable **Coder 3** as the third slot, bound to `/srv/0xdeck-wt3`, using the shared Coder contract and the role-scoped installation token, subject to the preflight above. It gets no Reviewer or Orchestrator authority, and the user-only merge and independent Reviewer requirements are unchanged.

Recorded open items, not fixed by this change:

1. Commit authorship is overridden by the shared `/srv/0xdeck/.git/config` for every slot (see above).
2. `pull_requests: write` technically permits merging; the merge prohibition is contractual.
3. Coder 1 and Coder 2 role prompts still name permanent `team/wt1`/`team/wt2` branches.
4. `deck-role`'s usage comment omits `coder-3`.

## Safety checks and caveats

- Confirm the actual package revision before relying on new or nontrivial frontmatter features. `pi list` confirms the configured package source, not its commit hash.
- Respect the user's **only-human-merge** policy. GitHub token scopes and branch protection should enforce it where possible.
- Never claim that labels, task prefixes, `tools` selection, CWD, or prose instructions prevent all GitHub/filesystem writes by another process.
- The previous Cursor automations are disabled per user screenshots; do not revive them. Treat leftover webhooks, bot permissions and protection rules as separate infrastructure audit items.
- The existing local team workspace is **not** the GitHub 0xDeck repository. Merging this document changes no local Pi setup automatically.
- When deploying, avoid duplicating contract content or leaving stale legacy instructions in the active prompt chain.
