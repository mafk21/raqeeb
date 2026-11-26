# Changelog

## 0.3.0
- No more placeholder data. When no sessions are found Raqeeb shows a clear screen that says what it looked for, where, and why it found nothing.
- First-run setup: detects Claude Code folders, lets you set and save the path, explains how to start a session, has a re-scan button. Reopen it any time with **Setup**.
- Sample data only through `--demo` or the **Try demo** button, always marked with a DEMO banner.
- Setup API is same-origin only and the server answers localhost hosts only.
- Tests for the empty states, the setup API and the origin checks (9 tests).

## 0.2.0
- Split into `lib/sessions.js` and `lib/pricing.js`; added automated tests.
- Command-line options: `--port`, `--dir`, `--demo`, `--help`, `--version`; supports `CLAUDE_CONFIG_DIR`.
- Cost estimate now varies by model name (Opus, Sonnet, Haiku).
- Spend by project panel; clearer banners when no session is found.
- Parse cache so large session files are not re-read every 5 seconds.
- Sub-agent (sidechain) messages no longer overwrite the main agent's last message.
- A question stops counting as "waiting" after 2 hours.
- Path traversal protection and a health endpoint.
- Flat ink-and-paper design with light and dark mode.

## 0.1.0
- First version: board, inbox, cost estimate, demo data.
