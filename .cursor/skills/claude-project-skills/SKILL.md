---
name: claude-project-skills
description: >-
  Explains dual-home project skills (.cursor/skills vs .claude/skills) and sync
  policy. Use when the user references .claude, Claude Code skills, or
  maintaining playwright-cli documentation in both locations.
---

# Project skills: Cursor + Claude Code

`playwright-cli` documentation lives in **two mirrored trees**; keep them **identical** when editing.

| Location | Consumer |
|----------|----------|
| [.cursor/skills/playwright-cli/](../playwright-cli/) | **Cursor** (auto-discovered skills) |
| `.claude/skills/playwright-cli/` | **Claude Code** |

## Maintenance

After changing either tree, copy to the other so they stay in sync:

```bash
cp -r .cursor/skills/playwright-cli/. .claude/skills/playwright-cli/
# or the reverse, depending on which side you edited
```

## When to read what (Cursor)

| Task | Open |
|------|------|
| **playwright-cli** overview, commands | [playwright-cli/SKILL.md](../playwright-cli/SKILL.md) |
| Route mocking | [references/request-mocking.md](../playwright-cli/references/request-mocking.md) |
| `run-code` / advanced APIs | [references/running-code.md](../playwright-cli/references/running-code.md) |
| Named sessions, profiles | [references/session-management.md](../playwright-cli/references/session-management.md) |
| Cookies, storage state | [references/storage-state.md](../playwright-cli/references/storage-state.md) |
| Test generation from CLI | [references/test-generation.md](../playwright-cli/references/test-generation.md) |
| Tracing | [references/tracing.md](../playwright-cli/references/tracing.md) |
| Video | [references/video-recording.md](../playwright-cli/references/video-recording.md) |

## Coordination with repo rules

- **Playwright E2E (TypeScript, POM, `getByRole`)**: [.cursor/rules/playwright-e2e-testing.mdc](../../rules/playwright-e2e-testing.mdc).
- **`allowed-tools` in YAML** is for Claude Code; in Cursor, run `playwright-cli` via the terminal when needed.

## Adding a new shared skill

1. Add `SKILL.md` under `.cursor/skills/<name>/` (and optional `references/`).
2. Mirror the same folder under `.claude/skills/<name>/`.
3. Extend the table above in this file.
