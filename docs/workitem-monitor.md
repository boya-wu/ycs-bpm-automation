# WorkItem Background Monitor

## Purpose

Run `bpm-workitemCheck` in background every 5 minutes on Windows, without clicking the "退回重辦" action, and keep output concise.

## Environment Variables

Configure in `.env`:

- `BPM_BASE_URL`
- `PLAYWRIGHT_BPM_USER`
- `PLAYWRIGHT_BPM_PASSWORD`
- `BPM_TARGET_PROJECT_CODE` (optional, default: `DY23-0742`)
- `BPM_APPROVAL_COMMENT` (optional, default: `請補上 WorkItem。`)
- `BPM_ENABLE_REEXECUTE` (optional, default: `false`; set `true` to actually click "退回重辦")
- `BPM_LOGIN_LOCALE` (optional: `zh` or `en`)
- `BPM_MAX_PAGES` (optional, default: `100`)

## Manual Run

Use:

```bash
npm run monitor:workitem
```

The command runs Playwright Chromium check and prints a single summary line.

## Output Format

Success example:

```text
[2026-03-24 14:30:02] OK project=DY23-0742 checked=3 filled=2 exempt=1 return=1 popup=1 worklist=1 duration=15.2s
```

Failure example:

```text
[2026-03-24 14:35:01] FAIL project=DY23-0742 reason="locator timeout" duration=30.0s
```

Log file path:

`logs/workitem-monitor.log`

## Windows Task Scheduler (Every 5 Minutes)

1. Open **Task Scheduler** -> **Create Task**.
2. In **General**:
   - Name: `WorkItem Monitor`
   - Select "Run whether user is logged on or not" if needed.
3. In **Triggers** -> **New**:
   - Begin the task: `On a schedule`
   - Daily, repeat task every: `5 minutes`
   - For a duration of: `Indefinitely`
4. In **Actions** -> **New**:
   - Program/script: path to `bash.exe` (Git Bash), for example:
     `C:/Program Files/Git/bin/bash.exe`
   - Add arguments:
     `-lc "cd /c/Users/Boya/Documents/GitHub/ycs-bpm-automation && npm run monitor:workitem"`
5. In **Start in** (optional but recommended):
   - `C:/Users/Boya/Documents/GitHub/ycs-bpm-automation`
6. Save and run once manually to verify.

## Troubleshooting

- **Login failed / timeout**: verify `BPM_BASE_URL`, account, password, and network access.
- **No matching rows**: verify `BPM_TARGET_PROJECT_CODE` and whether current queue contains target forms.
- **TLS/SSL issues**: check Playwright config `ignoreHTTPSErrors` setting for your environment.
- **No logs generated**: ensure task uses project root and has write permission to `logs/`.
- **`return=0` but expected returned**:
  1. Confirm `.env` has `BPM_ENABLE_REEXECUTE=true`.
  2. Verify popup flow is shown after clicking `退回重辦` (select returned step, click `確定`).
  3. Verify JS confirm dialog appears and is accepted.
  4. Check summary counters:
     - `popup` > 0 means popup-side success signal was observed.
     - `worklist` > 0 means worklist row now has `退回重辦` prefix.
  5. If `popup>0` but `worklist=0`, refresh/reopen worklist and validate row rendering delay.
