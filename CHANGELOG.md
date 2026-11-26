# Changelog

## 0.15.0
- While you were away: when you come back after 15+ minutes, a list of sessions that changed since you last had the page open, with each one's current state and last words. Nothing is summarised (AI summaries are not built). The "last visit" time is stored in your browser only.

## 0.14.0
- Licence layer with feature flags. Provider-agnostic (Polar and Gumroad adapters), with empty placeholder settings in lib/license-config.js. Nothing is on sale: the License dialog says so, and no Pro feature is built. Tested with mocked provider replies only, never against a real account.

## 0.13.0
- MCP server for handoff notes: `raqeeb mcp` (tools handoff_read, handoff_write), Claude Code first. Handoffs page shows the connect command. A real Claude Code 2.1.332 connected to it; a model calling the tools was not tested.
- 2 new tests (44 total).

## 0.12.0
- Same-repo warning: a tag on agent cards when two active sessions share one git checkout. Repo-level only, worktrees are not flagged. Demo mode now shows the real answering status per tool instead of "not supported" for all.
- 2 new tests (42 total).

## 0.11.0
- Rule-file snippet on the Handoffs page (shown and copyable, never written to your files). Notes that agents write by hand are scanned for keys when read, and hidden with a warning if one is found.
- 1 new test (40 total).

## 0.10.0
- Save handoff: a button in an agent's detail panel drafts a note from the agent's last message, the task, and the uncommitted files git shows. You edit it and press Save note. A last message that looks like it holds a key is left out of the draft. Fixed in the same change: a leading-space bug that cut the first letter off drafted file paths (caught by a test).
- 2 new tests (39 total).

## 0.9.0
- Handoffs: per-project notes stored in `<repo>/.raqeeb/handoff/`, a Handoffs page with a timeline, pinned project notes, a write form, Copy as prompt, Copy project context, Retire, and an "older than the code" marker. Secret pattern check and a 2 KB cap on every save. Demo mode shows labelled sample notes and saves nothing.
- 8 new tests (37 total), plus a headless browser run on a real git repo.

## 0.8.1
- License changed from MIT to PolyForm Noncommercial 1.0.0: free for non-commercial use, no commercial use without permission. Raqeeb is now described as source-available, not open source. Copies obtained under MIT before this change keep MIT.

## 0.8.0
- Aider can be answered from the dashboard: start it with `raqeeb wrap aider`. A small Python wrapper (standard library only) runs Aider in a pseudo-terminal, shows its `(Y)es/(N)o` confirmations as cards with the real options, and types your click. Tested against a real Aider 0.86.2 and with a fake agent in the test suite.
- Re-checked Cursor, Gemini CLI and Cline. They stay terminal-only, and the Setup screen and cards now give each tool's specific reason.

## 0.7.0
- Answer from the dashboard for Claude Code (approve or deny, plus multiple-choice questions) and Codex CLI (approve or deny), through each tool's `PermissionRequest` hook. Turn on with `raqeeb hooks install claude|codex`.
- Question cards show the real command or file, option buttons, and an "Answer in terminal instead" button. If you answer in the terminal, the card goes away.
- Safe by default: no dashboard open means the tool shows its own prompt right away; a 2 minute limit; same-origin answers only; token-protected helper; answers validated against the offered options.
- Setup screen shows, per tool, whether answering is supported, and why not when it is not (Cursor, Gemini CLI, Cline, Aider).
- 7 new tests, including a helper-process test and a real browser click-through run on fixtures. Not tested on real Claude Code or Codex installs.

## 0.6.0
- Question-first dashboard. The top of the page says how many agents need you, then lists each question with the tool, project, task and how long it has waited. Details, Copy folder and Dismiss on each (dismissed until the agent says something new).
- Everything else is one line per agent, grouped Working and Finished. Usage, tool status and spend moved into a collapsed "Usage and tools" section.
- Calm empty state when nothing is waiting. Tab title shows the waiting count.
- Site: headline and copy lead with questions, and the demo is labelled simulated.

## 0.5.0
- Three more tools: Gemini CLI, Aider and Cline, each its own adapter, all experimental (written from published format notes, tested with fixture files only).
- Setup screen has a panel for each; new flags `--gemini-dir`, `--aider-dir`, `--cline-dir`.
- Adapters can say a tool is asking for input (Cline approvals and follow-up questions show as Waiting).
- Wide folder searches (Aider) are cached for a minute and skip `node_modules` and hidden tool folders.
- No price rates for the new tools: tokens only. 21 tests.

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
