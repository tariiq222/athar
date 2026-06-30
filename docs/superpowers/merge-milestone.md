# Milestone Merge Workflow — Automated Procedure

> **Source of truth for the merge-and-cleanup pipeline applied at the end of every Phase 7 milestone (M1, M2, M2.1, V1.1, V1.2, V2).**
> Updated 2026-06-30 after M1 merge (commit `8f1d1ef` on main).

---

## When to use

After the final review of a milestone branch is **APPROVED** and you want to ship it to `main`. The pipeline gates on:

- Working tree clean (no modified tracked files)
- Currently on the milestone branch
- Frontend checks (lint, typecheck, test) green on the branch
- Local `main` is a fast-forward of `origin/main`

If any gate fails, the script **stops** before touching main or origin.

---

## The pipeline (single command)

```bash
# From the milestone branch, after review is APPROVED:
scripts/merge-milestone.sh tariq/2026-06-30-phase7-m2-core

# With push (when ready to ship to origin):
scripts/merge-milestone.sh tariq/2026-06-30-phase7-m2-core --push
```

The script runs **9 gated steps** — if any fails, it stops and refuses to advance:

| # | Step | Gate | Failure action |
|---|------|------|---------------|
| 1 | Reject dirty working tree | `git diff --quiet && git diff --cached --quiet` | Die before touching main |
| 2 | Reject if not on the milestone branch | `git branch --show-current == $BRANCH` | Die |
| 3 | Pre-merge checks on the branch | `web/`: lint, typecheck, test (warn-only) | Die on lint/typecheck fail |
| 4 | Fetch origin and switch to main | `git switch main && git merge --ff-only origin/main` | Die if non-ff |
| 5 | Merge with `--no-ff` + structured commit message | `git merge --no-ff $BRANCH` | Die on conflict (resolve manually) |
| 6 | Post-merge checks on main | lint, typecheck, build (warn-only) | Die on lint/typecheck — refuses push |
| 7 | (Optional) Push to `origin/main` | Only if `--push` flag | Skip silently without flag |
| 8 | Delete the merged branch locally | `git branch -d` (safe, refuses if unmerged) | Warn if refused |
| 9 | Print merge summary | — | Always |

---

## Why this procedure (the binding rules)

These come from the project's hard rules and learned rules:

- **LR-008 — Branch isolation.** Milestones live on their own `tariq/<date>-<slug>` branch. `branch-guard.sh` forks on contention; this script is the *clean* end-of-branch path.
- **No destructive git operations without explicit confirmation.** The script asks for the branch name and `--push` explicitly. `git branch -d` is safe; `git push --force` is never used.
- **No silent falls.** Each step prints its status; a missing test command line never silently passes.
- **No PR for solo milestone merges.** When one owner (Tariq) drives a milestone end-to-end and the branch is local, local merge is faster and reuses the same audit trail. PRs are reserved for cross-team review (e.g. when the engine work lands into the frontend plan).

---

## Recoveries for the predictable failure modes

| Symptom | Cause | Recovery |
|---|---|---|
| `working tree has modified tracked files` | Backend session left files in working tree | `git status` → revert or commit only the frontend files explicitly |
| `currently on 'X'; must be on 'Y'` | On the wrong branch | `git switch Y` then re-run |
| `merge conflict` | Local `main` drifted | Resolve, `git merge --continue`, then re-run from step 6 |
| `lint failed on merged main — DO NOT PUSH` | Cross-file regression introduced by merge | Revert the merge with `git reset --hard origin/main`, fix, retry |
| `branch has unmerged commits` | Script couldn't `-d` (usually fine) | Check `git branch -d` output, decide `-D` manually only if certain |

---

## M1 merge log (2026-06-30, executed manually before this script existed)

- Branch: `tariq/2026-06-30-phase7-m1-foundations` → 6 commits (T1.1 + T1.2-1.6 batch + .gitignore housekeeping)
- Pre-merge: lint 0 errors, typecheck 0 errors, `next build` ✓ (2 static pages)
- Merge commit: `8f1d1ef` (`--no-ff`)
- Local branch: deleted
- Push to origin: **skipped** (awaiting explicit consent — re-run with `--push` when ready)

---

## Future use

When M2 (post `engine-http-surface` merge) and M2.1 ship, run:

```bash
git switch tariq/2026-06-30-phase7-m2-core
# (after review APPROVED)
scripts/merge-milestone.sh tariq/2026-06-30-phase7-m2-core --push
```

The same pipeline applies to V1.1, V1.2, V2.
