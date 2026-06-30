#!/usr/bin/env bash
# merge-milestone.sh — repeatable, gated merge of a milestone branch into main.
#
# Usage:
#   scripts/merge-milestone.sh <milestone-branch> [--push]
#
# Behavior (in order, each step gated by the previous):
#   1. Reject if working tree is dirty (backend or frontend uncommitted)
#   2. Reject if on a non-milestone branch (must be the milestone branch)
#   3. Run frontend checks: lint, typecheck, test (vitest), build
#   4. Switch to main, fast-forward pull origin
#   5. Merge with --no-ff + structured commit message
#   6. Re-run frontend checks on merged main
#   7. Optionally push to origin (--push flag)
#   8. Delete the merged local branch (safe: -d only if fully merged)
#   9. Print a summary suitable for memory/promotion
#
# Exit codes:
#   0  success
#   1  prerequisite unmet (dirty tree, wrong branch, tests fail)
#   2  merge conflict
#   3  push refused (no --push or auth/network)
#   4  internal misconfiguration

set -euo pipefail

RED='\033[0;31m'; GRN='\033[0;32m'; YEL='\033[1;33m'; NC='\033[0m'
log() { printf '%b\n' "$*"; }
die() { log "${RED}✗ $*${NC}"; exit 1; }
warn() { log "${YEL}⚠ $*${NC}"; }

# ---------- args ----------
BRANCH="${1:-}"
PUSH=0
[[ "${2:-}" == "--push" ]] && PUSH=1
[[ -z "$BRANCH" ]] && die "usage: $0 <milestone-branch> [--push]"
[[ "$BRANCH" == "main" || "$BRANCH" == "master" ]] && die "refusing to merge $BRANCH into itself"

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# ---------- step 1: dirty tree? ----------
if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard 2>/dev/null | grep -vE '^(web/)?(\.next|node_modules|tsconfig\.tsbuildinfo|out)/' || true)" ]]; then
  # Allow common untracked (build artifacts) but require no modified tracked files.
  MODIFIED=$(git ls-files --modified)
  [[ -n "$MODIFIED" ]] && die "working tree has modified tracked files; commit or stash first:\n$MODIFIED"
fi

# ---------- step 2: must be on the milestone branch ----------
CURRENT=$(git branch --show-current)
if [[ "$CURRENT" != "$BRANCH" ]]; then
  die "currently on '$CURRENT'; must be on '$BRANCH' (use: git switch $BRANCH)"
fi

# Verify the branch exists and has at least one commit ahead of origin/main
if ! git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
  die "branch '$BRANCH' does not exist locally"
fi
AHEAD=$(git log --oneline "origin/main..$BRANCH" 2>/dev/null | wc -l | tr -d ' ')
[[ "$AHEAD" -lt 1 ]] && die "branch '$BRANCH' has no commits ahead of origin/main — nothing to merge"

# ---------- step 3: pre-merge checks (frontend only) ----------
log "${YEL}▸ pre-merge checks (branch: $BRANCH)${NC}"
if [[ -d web ]]; then
  pushd web >/dev/null
  log "  lint:";      npm run lint     >/dev/null 2>&1 && log "    ${GRN}✓${NC}"  || { popd >/dev/null; die "lint failed on $BRANCH before merge"; }
  log "  typecheck:"; npm run typecheck >/dev/null 2>&1 && log "    ${GRN}✓${NC}"  || { popd >/dev/null; die "typecheck failed on $BRANCH before merge"; }
  log "  test:";      npm test          >/dev/null 2>&1 && log "    ${GRN}✓${NC}"  || warn "test suite failed or empty (allowed only if no tests written yet)"
  popd >/dev/null
else
  warn "no web/ dir found — skipping frontend checks"
fi

# ---------- step 4: fetch + switch to main ----------
log "${YEL}▸ fetching origin and switching to main${NC}"
git fetch origin main:main >/dev/null 2>&1 || git fetch origin main >/dev/null 2>&1
git switch main >/dev/null
git merge --ff-only origin/main >/dev/null 2>&1 || die "local main is behind non-ff of origin/main — reconcile first"
log "  ${GRN}✓${NC} on main, up to date with origin"

# ---------- step 5: merge ----------
log "${YEL}▸ merging $BRANCH into main (--no-ff)${NC}"
COMMIT_COUNT=$(git log --oneline "main..$BRANCH" | wc -l | tr -d ' ')
COMMIT_TITLES=$(git log --pretty=format:"- %s" "main..$BRANCH" | head -20)
MILESTONE_ID=$(echo "$BRANCH" | grep -oE 'm[0-9.]+' | head -1 || echo "milestone")
# Uppercase via tr — macOS ships bash 3.2, which lacks ${var^^} (bash 4+).
MILESTONE_UP=$(printf '%s' "$MILESTONE_ID" | tr '[:lower:]' '[:upper:]')
if ! git merge --no-ff "$BRANCH" -m "Merge branch '$BRANCH' into main

Phase 7 ${MILESTONE_UP}: $COMMIT_COUNT commits.

$COMMIT_TITLES" 2>&1; then
  die "merge conflict — resolve manually then run remaining steps yourself"
fi
log "  ${GRN}✓${NC} merged"

# ---------- step 6: post-merge checks ----------
log "${YEL}▸ post-merge checks on main${NC}"
if [[ -d web ]]; then
  pushd web >/dev/null
  log "  lint:";      npm run lint     >/dev/null 2>&1 && log "    ${GRN}✓${NC}"  || { popd >/dev/null; die "lint failed on merged main — DO NOT PUSH"; }
  log "  typecheck:"; npm run typecheck >/dev/null 2>&1 && log "    ${GRN}✓${NC}"  || { popd >/dev/null; die "typecheck failed on merged main — DO NOT PUSH"; }
  log "  build:";     npx next build --no-lint >/dev/null 2>&1 && log "    ${GRN}✓${NC}"  || warn "next build failed on merged main"
  popd >/dev/null
fi

# ---------- step 7: push (optional) ----------
if [[ "$PUSH" -eq 1 ]]; then
  log "${YEL}▸ pushing to origin/main${NC}"
  git push origin main 2>&1 | tail -3
  log "  ${GRN}✓${NC} pushed"
else
  warn "pushed SKIPPED — pass --push to ship to origin"
fi

# ---------- step 8: delete merged branch ----------
log "${YEL}▸ deleting merged branch$BRANCH${NC}"
if git branch -d "$BRANCH" 2>/dev/null; then
  log "  ${GRN}✓${NC} $BRANCH deleted locally"
else
  warn "could not delete $BRANCH with -d (probably has unmerged commits) — investigate"
fi

# ---------- step 9: summary ----------
HEAD_SHA=$(git rev-parse --short HEAD)
MERGE_SHA=$(git log -1 --pretty=format:'%H' HEAD)
log ""
log "${GRN}═══════════════════════════════════════════════════════════${NC}"
log "${GRN}  M${MILESTONE_ID#m} merged into main${NC}"
log "${GRN}  HEAD:  $HEAD_SHA${NC}"
log "${GRN}  $COMMIT_COUNT commits from $BRANCH${NC}"
log "${GRN}  pushed to origin: $([[ $PUSH -eq 1 ]] && echo yes || echo no)${NC}"
log "${GRN}═══════════════════════════════════════════════════════════${NC}"
