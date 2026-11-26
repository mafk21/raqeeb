# Changelog

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
