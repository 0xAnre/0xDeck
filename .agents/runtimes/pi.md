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

## Model and provider split (decided 2026-11-12)

**Only the Orchestrator runs on Codex.** Coder, Reviewer and Principal Engineer run on a fixed non-Codex model. This is a user decision, not a runtime default: the Codex usage limit that killed orchestrator turns was also spent by Coder/Reviewer runs that had silently inherited the Orchestrator's provider and account.

### Why inheritance is rejected

The three role definitions carried no `model:` key. Per the installed package reference (`README.md:163` — "When unset, the child inherits the parent's model") and its launch resolver (`src/launch/child-launch-plan.ts:185` — `params.model ?? agentDefs?.model ?? options.parentModelRef`), a Coder launched from a Codex Orchestrator ran **on Codex, on the same account and the same quota**. The child was never asked which provider to use; it copied the parent's. Pinning the model in the definition removes the coupling in both directions: role work no longer depends on the Orchestrator's provider, and the Orchestrator's provider choice cannot leak into role work. Inheritance is rejected because it makes a role's cost and availability an accident of whoever launched it.

| Role | Provider / model | `thinking` | Launched by | Notes |
| --- | --- | --- | --- | --- |
| Orchestrator | user's choice (Codex when the user selects it) | user's choice | user | **Not pinned here.** The only role expected to spend Codex quota. |
| Coder | `opencode-go/deepseek-v4.1-flash` | `max` | Orchestrator | Implementation, commits and PR updates on its assigned branch. Covers every Coder slot (`coder-1`, `coder-2`, `coder-3`). |
| Reviewer | `opencode-go/deepseek-v4.1-flash` | `max` | Orchestrator | Independent review of the actual diff; no write mandate. |
| Principal Engineer | `opencode-go/deepseek-v4.1-flash` | `max` | **user only** | On-demand; no automatic trigger and no automatic participation in PRs. |

`thinking` uses Pi's own level keys (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`; see Pi's `docs/models.md`). Pi clamps a level the selected model does not support. **Every delegated role — Coder, Reviewer and Principal Engineer — runs at `max`** (user decision, 2026-11-14). `max` is therefore not reserved for the Principal Engineer, and `high` is no longer a working level for Coder or Reviewer: all three delegated roles are deliberately configured identically, and the Principal Engineer stays distinguished by being user-invoked only, not by its thinking level. The Orchestrator's model and level remain user-selected and are not pinned here.

### Hard pin, not a suggestion

Each of the three definitions also sets `allow-model-override: false` (`README.md:165`; enforced at `src/launch/policy.ts:182`, which drops a launch-time `model`/`thinking` whenever `allowModelOverride === false`). Without it, a launch could still name another model and put role work back on the Orchestrator's provider. With it, the model written in the file is the model that runs for every new launch, and a resume cannot be re-pointed at another model: it reuses the model persisted when the child was launched (`src/runtime/resume-service.ts:143`). A child started before the pin therefore keeps its old provider until it is finished or replaced by a fresh launch — restart, do not resume, when a role must move onto the pinned model. Re-enabling per-task model choice for a role is a deliberate user decision, not an Orchestrator convenience, and must be recorded rather than assumed.

### Provider limit or outage

A pinned model is a hard dependency, and that is the intended trade-off.

- If the pinned provider or model is unavailable, rate-limited, or the account is out of quota: **stop and report**. Name the role, the pinned model, the failing check and the error text.
- **Never silently switch provider or model** — not to Codex, not to the Orchestrator's provider, not to a "similar" model — and never edit another role's definition to route around an outage. A silent fallback is indistinguishable from a working pin and reintroduces exactly the quota coupling this split removes.
- Changing a pinned model is a user decision recorded on the Issue/PR, not an in-flight workaround. A provider problem never authorizes an automatic escalation to the Principal Engineer; that role stays strictly user-invoked.

### Where the definitions live

The three definitions live **outside the repository**, in Pi's global agent directory (`getAgentConfigDir()`, `src/agents/definitions.ts:82` — `PI_CODING_AGENT_DIR`, else `~/.pi/agent`), as `agents/{coder,reviewer,principal-engineer}.md`. They are runtime state, not repository state:

- They are not versioned with 0xDeck, and merging a documentation change here modifies no machine.
- A change to them is recorded as **evidence in the PR** — before/after frontmatter and the package parser's resolved output — not as a diff in this repository. Do not describe a repo diff as having "pinned" the models.
- A new machine, or one whose definitions were reset, must have the same frontmatter applied locally before it behaves as this adapter describes.

#### Applied state and last change (Issue #234, 2026-11-14)

| Definition | `model` | `thinking` | `allow-model-override` |
| --- | --- | --- | --- |
| `~/.pi/agent/agents/coder.md` | `opencode-go/deepseek-v4.1-flash` | `max` | `false` |
| `~/.pi/agent/agents/reviewer.md` | `opencode-go/deepseek-v4.1-flash` | `max` | `false` |
| `~/.pi/agent/agents/principal-engineer.md` | `opencode-go/deepseek-v4.1-flash` | `max` | `false` |

`coder.md` and `reviewer.md` previously said `thinking: high`. Each file changed on that one frontmatter line only; every other frontmatter field, the file mode and the whole prompt body are byte-for-byte identical. Backups outside the repository: `/Users/0xanrelins/pi-agent-def-backups/20261114T035823Z/coder.md` (previous sha256 `1a8e2faef65e76221ff76aed1e61d89870ae6bc162a809ef14af8b1428e1d316`, applied `d2a0f771f4b2ce76e7b94e269167981ce42f309ae6a1dd5fca88ee9c932ef87e`) and `.../reviewer.md` (previous `dc759aa89bb1d1fcb1ef153b91bd880550d456f99ed4760391348e6b22751142`, applied `2e5278dd199d5e9fffd234d6643f0e31b222c5b3dcd9b6333cb86172334e80a3`). `principal-engineer.md` was already at `max` and was not modified (`b2f638376016018e15f8798f34d89b3eb610df62afcaa21efe526fcb45f805dc`).

Resolution was checked with the installed package's own parser (`getEffectiveAgentDefinitions()` from `~/.pi/agent/git/github.com/edxeth/pi-subagents/src/agents/definitions.ts`), which reports `model: opencode-go/deepseek-v4.1-flash`, `thinking: max` and `allowModelOverride: false` for all three, exactly as in the table above. No child was launched and no provider request was made. A child started before this edit keeps `high` until it is restarted, not resumed.

This section describes the **Pi subagent path only**. The VPS deployment below launches roles through `deck-role` and per-role prompts under `/root/.config/0xdeck-agent-app/roles/`, a separate launcher; pinning the Pi definitions does not change the VPS slots, and changing a VPS role prompt does not change these definitions.

Both runtime paths now carry the same provider, model and level: these child definitions and the VPS `deck-role` launcher, which pins the same values as explicit Pi CLI arguments instead of in a child definition (see [Launcher and role loading](#launcher-and-role-loading)). A delegated role must not run on another provider, on an inherited default, or at a lower level than this table, on either path.

## Target ownership: shared contract vs Pi adapter

| Shared, versioned in the 0xDeck repo | Specific to this Mac / Pi |
| --- | --- |
| `AGENTS.md` — technical project context | `~/pi-0xdeck-team/AGENTS.md` — top-level Pi bootstrap |
| `.agents/WORKFLOW.md` — state transitions & handoffs | Pi child definitions in `~/.pi/agent/agents/` (the historical team workspace used `~/pi-0xdeck-team/.pi/agents/`) |
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
7. **Principal Engineer:** do not create an automatic Pi or GitHub trigger. The user explicitly chooses whether and when to consult the Principal Engineer; its pinned model is in the [model and provider split](#model-and-provider-split-decided-2026-11-12).
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
- The repository never named it. `git log origin/main -S"coder-3" -- .agents docs AGENTS.md` and `git log origin/main -S"wt3"` return nothing on `origin/main` before this change (`--all` now matches this change's own commit, which introduces both strings). `.agents/runtimes/pi.md` was added by `e2c1a05` and documents only the Mac `coder`/`coder-2` children; it was simply never updated after the VPS migration.
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

- `/usr/local/bin/deck-role <role>` (755; installed 2026-11-03 03:26, model block edited 2026-11-14T03:44:07Z) maps `orchestrator|reviewer|principal-engineer` → `/srv/0xdeck` and `coder-1|coder-2|coder-3` → `/srv/0xdeck-wt1|wt2|wt3`; an unknown role exits 2.
- It fast-forwards the worktree to `origin/main` only when `git status --porcelain` is empty **and** `HEAD` is an ancestor of `origin/main` (`sync_worktree`). A dirty tree or an unmerged branch is reported and left untouched. Observed on launch: `worktree(coder-3) = 08e027d (origin/main)`.
- It starts `hc run --bg --name <role> --cwd <worktree> -- bash -lc ". <role>/env.sh; exec pi <model args> --append-system-prompt <role>/role.md"`. Since 2026-11-14 (Issue #234) `<model args>` is `--provider opencode-go --model deepseek-v4.1-flash --thinking max` for `coder-1|coder-2|coder-3|reviewer|principal-engineer` and empty for `orchestrator`, which therefore keeps running on the user's own Pi selection. Observed coder-3 terminal argv from the 2026-11-12 audit, i.e. *before* that correction: `bash -lc . '/root/.config/0xdeck-agent-app/roles/coder-3/env.sh'; exec pi --append-system-prompt '/root/.config/0xdeck-agent-app/roles/coder-3/role.md'`, cwd `/srv/0xdeck-wt3`.
- Delegated-role model pinning lives in the launcher's `# ---- model / thinking per role ----` case block, not in the role prompts. The drift Issue #234 fixed: that block pinned only `reviewer|principal-engineer` to `opencode-go/glm-5.3-flash` at `max`, while `coder-1|coder-2|coder-3` fell into the empty `*)` branch and inherited whatever the environment selected. The block is now the single mapping for all six names; the observable evidence is the launched terminal's argv (`hc ls --json`, `hc get <addr> --json`) or a stubbed `git`/`hc` resolution run of `deck-role` itself. An already-live terminal keeps the model it was started with until relaunched with `deck-role <role> --fresh`.
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

The repository ruleset `Protect main — user merge only` (id `25076079`, enforcement `active`, created 2026-10-14) blocks deletion and non-fast-forward updates and requires changes to reach `main` through a pull request, but it requires **0** approving reviews and has no required reviewers. That leaves two different cases: a PR whose commits GitHub attributes to a user with write access — the normal case for a Coder while the shared `.git/config` attributes commits to `0xAnre` — is **not** stopped by the 0-approval setting, so a holder of `pull_requests: write` could merge it; a PR containing *unattributed* commits **is** stopped, because the same ruleset sets `require_extra_approval_for_unattributed_changes: true`, so only the user's `pull_request`-mode bypass or an extra approval can merge it. This change's own PR reports `mergeStateStatus: BLOCKED` with both checks green, and the unattributed-changes rule is the only observed parameter that explains it. User-only merge remains contractual in both cases. Changing the ruleset or adding required reviews is repository/infrastructure policy and is out of scope here.

### Commit authorship is currently overridden (open item, not changed here)

- The role `.gitconfig` declares `0xdeck-vps-coder-3[bot] <0xdeck-vps-coder-3@users.noreply.github.com>`, but repository-local config outranks `GIT_CONFIG_GLOBAL`.
- `/srv/0xdeck/.git/config` — shared by every worktree; file mtime 2026-11-12 06:37:21, after this branch's routine `push -u` added `[branch ...]` tracking sections — contains `[user] name = 0xAnre`, `email = 299732504+0xAnre@users.noreply.github.com`. The `[user]` block itself is unchanged since the audit.
- Observed with the role environment sourced: `git var GIT_AUTHOR_IDENT` in `/srv/0xdeck-wt3` → `0xAnre <299732504+0xAnre@users.noreply.github.com>`; the same command in `/srv/0xdeck-wt1` with coder-1's env → identical. A Coder 3 commit today would therefore be authored as the user, not the declared bot string.
- This is shared state that affects every slot and the canonical repo, so this change does not alter it. Recommended fix, owned by the user: remove the `[user]` block from `/srv/0xdeck/.git/config` so each role resolves to its own `.gitconfig`, or set the identity per invocation. Until then, do not use commit authorship to decide which slot produced a change; use the PR author (`app/0xdeck-vps`), the branch and the handoff record.
- Decide that fix together with the ruleset: the declared bot author strings are **not** GitHub accounts, so commits authored that way are *unattributed* (`authors.user: null` via GraphQL), and the active ruleset sets `require_extra_approval_for_unattributed_changes: true`. Every commit of this change is unattributed — they were authored with the coder-2 bot identity through `GIT_AUTHOR_*`/`GIT_COMMITTER_*` overrides, which is this PR's deliberate choice, not the default for a Coder commit — and the PR reports `mergeStateStatus: BLOCKED` with both checks green; the user is a bypass actor with `pull_request` mode, so the user can still merge. Restoring bot authorship without adjusting that rule would make agent PRs permanently blocked.

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

### Runtime model pin recorded by Issue #234 (outside the repo)

The launcher's `reviewer|principal-engineer` case previously pinned `opencode-go/glm-5.3-flash` at `max` while all three Coder names had no model arguments at all, which is why a delegated role could run on an inherited provider or a model this adapter does not record. `/usr/local/bin/deck-role` was corrected on 2026-11-14T03:44:07Z so that `coder-1|coder-2|coder-3|reviewer|principal-engineer` all start Pi with `--provider opencode-go --model deepseek-v4.1-flash --thinking max`; `orchestrator` keeps the empty branch. Backup: `/root/backups/deck-role.20261114T034401Z` (previous sha256 `93c687fc93ccadc54d02bf82b71f23f12f922f1f5e18065bf8b4e883647d7616`, applied sha256 `98bddcbe322a27b9dbeb4298cee72f5d581e25f372228f28955aa9227bf20c2a`). Verified with `bash -n`, an exact diff against the backup, and a stubbed `git`/`hc` resolution run for all six role names (no terminal started, no credentials read). Live terminals launched earlier keep the old model until restarted with `--fresh`. The same task also moved the Pi child definitions to `max`, so both runtime paths now agree; that local change, its backups and the parser-resolved output are recorded under *Applied state and last change* in the Pi section above. Both changes are runtime-specific and are not part of the repository diff; they are recorded here and on PR/Issue #234.

### Decision

Enable **Coder 3** as the third slot, bound to `/srv/0xdeck-wt3`, using the shared Coder contract and the role-scoped installation token, subject to the preflight above. It gets no Reviewer or Orchestrator authority, and the user-only merge and independent Reviewer requirements are unchanged.

Recorded open items, not fixed by this change:

1. Commit authorship is overridden by the shared `/srv/0xdeck/.git/config` for every slot (see above).
2. `pull_requests: write` technically permits merging an attributed PR; unattributed PRs are blocked by the ruleset's extra-approval rule. The merge prohibition is contractual in both cases.
3. Coder 1 and Coder 2 role prompts still name permanent `team/wt1`/`team/wt2` branches.
4. `deck-role`'s usage comment omits `coder-3`.

## Safety checks and caveats

- Confirm the actual package revision before relying on new or nontrivial frontmatter features. `pi list` confirms the configured package source, not its commit hash.
- Respect the user's **only-human-merge** policy. GitHub token scopes and branch protection should enforce it where possible.
- Never claim that labels, task prefixes, `tools` selection, CWD, or prose instructions prevent all GitHub/filesystem writes by another process.
- The previous Cursor automations are disabled per user screenshots; do not revive them. Treat leftover webhooks, bot permissions and protection rules as separate infrastructure audit items.
- The existing local team workspace is **not** the GitHub 0xDeck repository. Merging this document changes no local Pi setup automatically.
- When deploying, avoid duplicating contract content or leaving stale legacy instructions in the active prompt chain.
