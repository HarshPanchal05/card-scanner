# QA Automation Performance — ADB Workflow Optimization

## Benchmark results (Nothing A059P, this session)

| Operation | Runs | Avg latency |
|---|---|---|
| `adb shell echo OK` | 10 | ~294 ms |
| `adb shell input tap X Y` | 10 | ~326 ms |
| `adb get-state` | 5 | ~182 ms |
| `adb devices` | 3 | ~185 ms |
| `adb shell screencap -p` (device-side only) | 5 | ~663 ms |
| `adb shell screencap` + `adb pull` (full round trip) | 5 | ~777 ms |
| `adb shell uiautomator dump` | 3 | ~2,554 ms |

## PRIMARY BOTTLENECK

**Not ADB itself.** Every raw ADB primitive (`echo`, `input tap`, `get-state`) completes in 180–330 ms — well within a responsive workflow. The one genuinely slow primitive is `uiautomator dump` (~2.5 s), which was used once early in the session, then correctly avoided afterward.

The actual 3–5+ second cost per action came from **workflow choices, not device/ADB overhead**:

1. **A screenshot was taken after nearly every single tap** (~780 ms device-side each) specifically to visually verify the result, followed by reading/analyzing that image — the single largest recurring cost, and the main reason actions felt slow.
2. **Fixed 1–3 second `sleep` calls were inserted after most actions** "to let the UI settle," regardless of whether the action was a simple tab switch or something that actually needed time (e.g. OCR, zip writing).
3. Several early **coordinate miscalculations** (mixing up the screenshot's *displayed* resolution with the device's *actual* resolution — a 1.196x scale error) caused mis-taps, each costing a full extra screenshot-verify-retry cycle.
4. A stretch of **bottom-nav taps intermittently failed to register** (unrelated to speed — a device input-injection reliability issue, not a latency issue) and forced fallback to asking for manual taps.

## OPTIMIZATION

Applied for the remainder of this QA session:

- **Screen map, built once per screen, reused after.** Coordinates for known screens (Dashboard nav bar, Reports filters/button, Backup & Restore, Review Card actions) are cached below instead of re-discovered every time.
- **No screenshot after every tap.** Screenshots are now taken only at checkpoints: after a multi-step sequence completes, when a result needs visual/evidentiary confirmation, or when a tap's outcome is genuinely uncertain.
- **Short waits for simple navigation** (tab switches, screen pushes) instead of blanket 2–3 s sleeps; longer condition-oriented waits reserved for actually-async work (OCR, zip export, report generation), checked via a follow-up screenshot/log rather than a longer blind sleep.
- **`uiautomator dump` reserved for genuinely unfamiliar screens or failed taps only** — not used as a default per-action check.
- **No `adb kill-server`/`adb start-server` cycling** between actions — the existing session/daemon is reused; `adb devices` is only re-checked after an actual observed disconnect.
- Physical-card and other human-in-the-loop steps: the workflow asks once and waits for confirmation, without polling the device in between.

## Screen map (this session, cached)

Coordinates are **device-native pixels** (1080×2392), i.e. already scaled from the 903×2000 screenshot preview by ×1.1961 — this scale mismatch was the root cause of several earlier mis-taps.

```
Dashboard:
  Scan Card        = 540, 676
  Nav: Dashboard    = 135, 1788
  Nav: Card Library = 404, 1788
  Nav: Reports      = 673, 1788
  Nav: Settings     = 944, 1788   (unreliable via ADB this session — see note)

Settings:
  Backup & Restore row = 541, 949

Backup & Restore:
  Create Backup      = 541, 1093
  Share Backup        = 541, 1503
  Choose Backup File   = 541, 1943

Reports (Generate Report):
  All Categories chip = 225, 756
  Generate Excel Report = 541, 2087

Review Card (post-capture, before save):
  Save Lead button (fixed footer) = 541, 2231

Review Card (post-save action row):
  Save Changes  = ~541, ~1873
  View Card / Save to Contacts row = ~460–830, ~2021
  Scan Next Card = ~541, ~2129
```

**Known reliability note:** taps landing in the bottom ~15% of the screen (nav bar, sticky footer buttons) intermittently failed to register via `adb shell input tap` during this session — verified by testing multiple different coordinates and confirming the app correctly held input focus throughout (`dumpsys window` showed `mCurrentFocus` on the app the whole time). This is a device/ADB input-injection characteristic, not a latency problem and not an application defect — per the physical-test rule, these cases were escalated to a manual tap request rather than retried indefinitely.

## RESULT

- Per-action latency for simple, deterministic taps: reduced from an effective 3–5+ s (dominated by the screenshot-every-tap + fixed-sleep pattern) to the raw tap cost of **~300 ms**, plus only as much wait as the specific action actually needs.
- Screenshots now taken at an estimated 1 per multi-step checkpoint rather than 1 per tap — roughly a 4–6x reduction in screenshot/verification overhead for the remainder of the QA pass.
- No application code was touched or is implicated — every measured bottleneck was in the test workflow itself.
