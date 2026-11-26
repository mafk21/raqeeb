# Changelog

## 0.4.0
- Multi-agent. Raqeeb now reads Claude Code, Codex CLI and Cursor through provider adapters in `lib/providers/`. Adding another tool is one file, documented in CONTRIBUTING.
- Codex CLI and Cursor adapters are **experimental**: written from published format notes and tested with fixtures only. Marked beta in the UI and README.
- Unified dashboard with a tool badge on each card, tool filter chips with counts, a per-tool status strip and spend by tool.
- First-run screen has one panel per tool: status, folder path, suggestions, start command and notes.
- Cost is only shown where a price rate exists (Claude Code). Other tools show tokens or "no usage data". No invented prices.
- New options `--codex-dir` and `--cursor-dir`; `--dir` stays as an alias of `--claude-dir`. Setup API takes a `provider`.
- Tests rewritten for the adapters, per-tool empty states and setup (15 tests).

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
