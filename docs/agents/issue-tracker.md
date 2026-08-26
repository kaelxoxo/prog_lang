# Issue tracker: GitHub

Issues and specifications for this repository live as GitHub Issues. Use the `gh` CLI for operations.

This local repository does not currently have a Git remote. Configure its GitHub `origin` before using issue-tracker commands.

## Conventions

- Create: `gh issue create --title "..." --body "..."`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open`
- Comment: `gh issue comment <number> --body "..."`
- Add or remove labels: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- Close: `gh issue close <number> --comment "..."`
- Pull requests as a triage surface: no

## Skill operations

When a skill says “publish to the issue tracker,” create a GitHub issue.

When a skill says “fetch the relevant ticket,” read the issue and its comments with `gh issue view`.

## Wayfinding

A wayfinding map is one issue labelled `wayfinder:map`. Its child tickets use `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`.

Use GitHub sub-issues and native blocking dependencies when available. Otherwise, use a task list in the map and a `Blocked by: #<number>` line in child issues.

Claim work by assigning the issue to yourself. Resolve it by posting the answer, closing the issue, and adding a concise decision pointer to the map.
