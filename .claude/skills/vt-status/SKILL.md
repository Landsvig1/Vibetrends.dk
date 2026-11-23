---
name: vt-status
description: Phone-sized status of vibetrends.dk. Open PRs with CI and review state, latest production deployment, main's last commit, and (locally only) worktrees with dirty or unmerged state. Read-only. Use when the owner asks "status", "what is open", "is prod up", "where are we" or runs /vt-status.
---

# vt-status

One screen, read-only. Never push, merge, comment, re-run, delete or edit
anything. Only `gh` GET calls and read-only `git` commands.

## Run

Run the block below as ONE Bash call, then print its output as the answer, with
at most one line of your own after it (the single most useful next action, e.g.
"PR #12 e2e was cancelled, re-run it"). Do not add headings, tables or prose.

```bash
set +e
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  GH=1
  R=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)
else
  GH=0
fi
[ -z "$R" ] && R=$(git remote get-url origin 2>/dev/null | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')

echo "== PRs ($R)"
if [ "$GH" = 1 ]; then
  gh pr list -R "$R" --state open --limit 12 \
    --json number,title,isDraft,reviewDecision,statusCheckRollup \
    --jq '(if length==0 then "none open" else .[] end) |
      if type=="string" then . else
      (.statusCheckRollup // []) as $c |
      (if any($c[]; (.conclusion // .state) | IN("FAILURE","ERROR","TIMED_OUT","ACTION_REQUIRED")) then "CI FAIL"
       elif any($c[]; (.conclusion // .state) == "CANCELLED") then "CI CANCELLED (re-run)"
       elif any($c[]; (.status // "COMPLETED") != "COMPLETED" or (.state // "") == "PENDING" or (.state // "") == "EXPECTED") then "CI running"
       elif ($c|length)==0 then "CI none" else "CI ok" end) as $ci |
      "#\(.number) \(.title[0:38]) | \($ci) | \(if .reviewDecision=="" or .reviewDecision==null then "no review" else (.reviewDecision|ascii_downcase|gsub("_";" ")) end)\(if .isDraft then " | draft" else "" end)"
      end'
else
  echo "gh missing or not authed: PR state unavailable"
fi

echo "== Prod"
if [ "$GH" = 1 ]; then
  D=$(gh api "repos/$R/deployments?environment=Production&per_page=1" --jq '.[0] | "\(.id) \(.sha[0:7])"' 2>/dev/null)
  if [ -n "$D" ]; then
    gh api "repos/$R/deployments/${D%% *}/statuses?per_page=1" \
      --jq ".[0] | \"\(.state) at ${D##* } (\(.created_at[0:16] | sub(\"T\";\" \")) UTC)\"" 2>/dev/null
  else
    echo "no Production deployment found"
  fi
else
  echo "unavailable without gh"
fi

echo "== main"
if [ "$GH" = 1 ]; then
  gh api "repos/$R/commits/main" --jq '"\(.sha[0:7]) \(.commit.message|split("\n")[0]|.[0:50]) (\(.commit.committer.date[0:16]))"' 2>/dev/null
else
  git fetch -q origin main 2>/dev/null; git log -1 --format='%h %s (%cr)' origin/main 2>/dev/null
fi

# Local only: skip in cloud sessions (a fresh clone has no sibling worktrees).
if [ "$CLAUDE_CODE_REMOTE" != "true" ] && git rev-parse --git-dir >/dev/null 2>&1; then
  echo "== Worktrees"
  git fetch -q origin 2>/dev/null
  git worktree list --porcelain | awk '/^worktree /{p=substr($0,10)} /^branch /{print p "\t" substr($0,19)}' |
  while IFS=$'\t' read -r path br; do
    [ "$br" = "main" ] && continue
    dirty=$(git -C "$path" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
    if git merge-base --is-ancestor "$br" origin/main 2>/dev/null; then m="merged"
    else
      ahead=$(git rev-list --count "origin/main..$br" 2>/dev/null)
      cherry=$(git cherry origin/main "$br" 2>/dev/null | grep -c '^+')
      if [ "$cherry" = 0 ]; then m="merged (squash)"; else m="$ahead ahead, unmerged"; fi
    fi
    echo "$(basename "$path") | $br | $([ "$dirty" = 0 ] && echo clean || echo "dirty $dirty") | $m"
  done
fi
```

## Output shape

```
== PRs (owner/repo)
#247 add cloud setup | CI ok | no review
== Prod
success at 2533e33 (2026-11-22 22:03 UTC)
== main
2533e33 Merge pull request #244 ... (2026-11-22T22:03)
== Worktrees          (local only)
quirky-gates-2bcd53 | claude/quirky-gates-2bcd53 | clean | 1 ahead, unmerged
```

## Rules

- Cloud session (`CLAUDE_CODE_REMOTE=true`): the Worktrees section is skipped
  by design. Say nothing about it.
- No `gh` or not authed: the block prints what it can from git and says which
  parts are unavailable. Report that plainly, do not guess PR or deploy state.
- A deployment state other than `success` (`failure`, `error`, `in_progress`,
  `queued`) goes first in your one-line follow-up.
- `CI CANCELLED` usually means the shared e2e concurrency group cancelled a
  queued run. It needs a re-run, not debugging. Do not re-run it yourself.
- Keep it to one phone screen: if more than 12 PRs are open, say how many are
  not shown.
- No em dashes or en dashes in anything you write.
