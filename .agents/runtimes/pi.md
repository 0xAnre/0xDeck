# Pi Runtime Adapter — 0xDeck

This is a **runtime-specific** deployment guide for the first implementation of the agent-agnostic [workflow](../WORKFLOW.md) and [role contracts](../roles/). Pi is one possible runtime; shared role definitions **must not** depend on it.

> This document does not configure the user's Mac by itself. Its sample paths must be checked against the actual machine. Do not treat deployment examples as permissions to edit user machines, merge PRs or trigger agents.

## Verified initial environment (2026-10-14)

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
| `.agents/roles/coder.md` | Coder 1 / Coder 2 CWD and agent launch metadata |
| `.agents/roles/reviewer.md` | Reviewer CWD and appropriately scoped review tools |
| `.agents/roles/principal-engineer.md` | Optional agent selected by user; **do not** auto-register a trigger |

No copying of long workflow or role prompts into child definitions. The adapter points each session to the appropriate shared documents.

## Suggested Mac migration (perform **after** the documentation PR merges)

1. **Verify state:** `git -C ~/Documents/0xdeck-pi status --short --branch`, `git -C ~/Documents/0xdeck-pi worktree list`, `pi list`. Do not clean, reset or delete existing worktrees automatically.
2. **Back up the current local team workspace files** and child agent definitions with a timestamped copy before editing. Preserve an inventory/rollback record; this is a new runtime setup, not compatibility with the retired workflow.
3. **Update the local main repo** to the merged `main` **only after** verifying the working tree is clean; then ensure each Coder worktree has the shared docs available on its task branch before launching a job. A Coder branch from an older `main` does not automatically inherit newly merged docs.
4. **Top-level Orchestrator:** simplify the local `~/pi-0xdeck-team/AGENTS.md` into a small Pi bootstrap that explicitly points to the repo's `AGENTS.md`, `.agents/WORKFLOW.md`, and `.agents/roles/orchestrator.md`. Replace obsolete local policy copies rather than retaining them as conflicting instructions.
5. **Coders:** preserve the two existing child names and separate worktree CWDs. Prefer `no-context-files: false` so each child loads the **new shared repo `AGENTS.md`** from its own CWD. Explicitly supply or instruct the child to read `.agents/WORKFLOW.md` and `.agents/roles/coder.md` at startup. Using `flags: --append-system-prompt <file>` is one supported option, provided the file exists at that exact worktree path when invoked.
6. **Reviewer:** preserve its dedicated child name and `cwd` on the main/reviewer repo. Load the repo `AGENTS.md`, workflow and shared Reviewer contract. Use a fresh child context; review only the actual Issue/PR/diff/test evidence. Limit tool capability as far as the chosen review mechanism permits; a generic `bash` tool with full `gh` credentials is **not** hard read-only enforcement.
7. **Principal Engineer:** do not create an automatic Pi or GitHub trigger. The user explicitly chooses whether and when to consult Codex (or a replacement agent).
8. **Smoke test:** in a non-mutating task, confirm the top-level Pi sees the new workflow, both Coder definitions are discoverable, and Reviewer has the expected shared contract; do not create Issues/PRs or start coding. Then test the full pipeline on one low-risk implementation task and document the result in the migration Issue.

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

Use the equivalent adapter for `coder-2` with its own worktree CWD, and for `reviewer` with the Reviewer contract and **no write mandate**. Agent definitions remain short; repeat neither the old local `GITHUB-WORKFLOW.md` nor legacy isolation instructions.

## Safety checks and caveats

- Confirm the actual package revision before relying on new or nontrivial frontmatter features. `pi list` confirms the configured package source, not its commit hash.
- Respect the user's **only-human-merge** policy. GitHub token scopes and branch protection should enforce it where possible.
- Never claim that labels, task prefixes, `tools` selection, CWD, or prose instructions prevent all GitHub/filesystem writes by another process.
- The previous Cursor automations are disabled per user screenshots; do not revive them. Treat leftover webhooks, bot permissions and protection rules as separate infrastructure audit items.
- The existing local team workspace is **not** the GitHub 0xDeck repository. Merging this document changes no local Pi setup automatically.
- When deploying, avoid duplicating contract content or leaving stale legacy instructions in the active prompt chain.
