# Raqeeb (رقيب)

**One local control room for all your AI coding agents: Claude Code, Codex CLI, Cursor, Gemini CLI, Aider and Cline.**

Raqeeb means "watcher" in Arabic. If you run more than one agent at once, often more than one kind, you lose track of them: which one is still working, which one stopped to ask you something, and what the day is costing. Raqeeb puts all of that on one page, on your own machine.

![Raqeeb dashboard, light mode](docs/dashboard-light.png)

![When nothing is waiting: working agents below, tool filters on the right](docs/dashboard-calm.png)

## What you get

- **One board for every agent, from every tool.** Six tools side by side. Each card has a tool badge, project, branch, task, last message and a status: working, idle, waiting on you, or done. Filter by tool.
- **An inbox of open questions.** When an agent ends its turn with a question, it shows up at the top under "Needs you", longest-waiting first.
- **Spend per tool and per project.** An estimate where a price is known (Claude Code), and token counts only where it is not. Raqeeb never invents a price.
- **Light and dark mode**, and a layout that works on a phone-sized window.
- **Local only.** Reads files already on your disk. No account, no telemetry, nothing uploaded. The server listens on `127.0.0.1`, so other machines cannot reach it.
- **Zero dependencies.** One small Node program. Nothing to install besides Node.

| Dark mode | Narrow window |
| --- | --- |
| ![Dark mode](docs/dashboard-dark.png) | ![Mobile layout](docs/dashboard-mobile.png) |

## Quick start

You need [Node.js](https://nodejs.org) 18 or newer.

**Option 1: run it straight from GitHub (no download step)**

```
npx github:mafk21/raqeeb
```

**Option 2: clone it**

```
git clone https://github.com/mafk21/raqeeb.git
cd raqeeb
node server.js
```

**Option 3: download a ZIP**

On the [repo page](https://github.com/mafk21/raqeeb), click **Code**, then **Download ZIP**. Unzip it, open a terminal in the folder, and run `node server.js`.

Then open **http://localhost:4317** in your browser. The page refreshes every 5 seconds.

### First run

The first time you open Raqeeb it checks the usual folder of each supported tool and tells you plainly what it found, tool by tool. If it cannot find any sessions it says so and shows a setup screen with one panel per tool. It never fills the page with made-up data.

![First-run screen](docs/first-run.png)

1. **Check each tool's panel.** It says Detected, Nothing recent or Not found, shows where Raqeeb looked, and lists other folders it finds. Type a different path and press **Save and scan** if yours lives elsewhere. Raqeeb remembers it in `~/.raqeeb/config.json`. You only need one tool to have sessions.
2. **Start a session** in any of them (the panel shows the command).
3. **Re-scan.** Press the button, or wait, the page checks every 5 seconds.

If a tool has no recent sessions it keeps its own empty state, and the dashboard shows a per-tool status strip so you can see which tools Raqeeb is reading.

Just want to look around? Press **Try demo with sample data** on that screen, or run `node server.js --demo`. Demo data is always marked with a red "DEMO" banner. You can reopen the setup screen any time with the **Setup** button in the top bar.

## Using it

1. Start Raqeeb and leave it open in a browser tab.
2. Use your agents as you normally do, in as many terminals and tools as you like. Sessions show up on their own.
3. Questions come first. Any agent that stopped to ask something appears at the top under **Needs you**, longest-waiting first, with its tool, project, the question, and how long it has waited. Press **Details** for the full context, **Copy folder** for a `cd` command to the project, or **Dismiss** to hide it until that agent says something new. Raqeeb cannot answer for you yet. Go to the terminal or app where the agent runs.
4. Everything else is listed below as one line per agent (working, then finished). Use the tool chips to focus on one tool. Spend, tool status and per-project cost are under **Usage and tools**. The browser tab title shows how many agents need you, for example `(2) Raqeeb`.

If Raqeeb finds no session from the last 24 hours in any tool it shows the setup screen, not sample data.

### Options

```
raqeeb [options]

  --demo           start in demo mode with sample data
  --port, -p N     port to listen on (default 4317, or $PORT)
  --claude-dir PATH  Claude Code projects folder (--dir is the same)
  --codex-dir PATH   Codex CLI sessions folder
  --cursor-dir PATH  Cursor projects folder
  --gemini-dir PATH  Gemini CLI folder (~/.gemini/tmp)
  --aider-dir PATH   folder to search for .aider.chat.history.md
  --cline-dir PATH   Cline tasks folder
  --version, -v    print the version
  --help, -h       show help
```

For each tool the folder is chosen in this order: its command-line option, the folder you saved on the setup screen, then the default in the table below.

## Supported agents

| Tool | Status | Default folder | What Raqeeb reads | Based on |
| --- | --- | --- | --- | --- |
| Claude Code | supported | `~/.claude/projects` (or `$CLAUDE_CONFIG_DIR/projects`) | session `.jsonl`: task, branch, model, token usage | [Claude Code docs for the location; format notes at harnessnotes.com](https://harnessnotes.com/session-transcripts/format) |
| Codex CLI | **experimental** | `~/.codex/sessions` (or `$CODEX_HOME/sessions`) | `rollout-*.jsonl`: session_meta, turn_context, event_msg (user and agent messages, token_count) | [agenthud schema notes](https://github.com/neochoon/agenthud/blob/main/docs/schemas/codex-session.md), [harnessnotes](https://harnessnotes.com/session-transcripts/format), [bough.run](https://www.bough.run/articles/what-is-in-a-codex-rollout-file) |
| Cursor | **experimental** | `~/.cursor/projects` | `*/agent-transcripts/<id>/<id>.jsonl` (Cursor Agent CLI and Agents window) | [harnessnotes](https://harnessnotes.com/session-transcripts/format), [agent-sessions guide](https://jazzyalex.github.io/agent-sessions/guides/cursor-agent-local-history.html), [vibecorral](https://vibecorral.com/cursor-cli) |
| Gemini CLI | **experimental** | `~/.gemini/tmp` (or `$GEMINI_CLI_HOME/.gemini/tmp`) | `<project>/chats/session-*.json` and `.jsonl`: user and `gemini` messages, model, token counts | [Gemini CLI chatRecordingTypes.ts](https://github.com/google-gemini/gemini-cli/blob/f8541cf7/packages/core/src/services/chatRecordingTypes.ts), [session docs](https://geminicli.com/docs/cli/session-management/), [deja format notes](https://vshulcz.github.io/deja-vu/registry/gemini.html) |
| Aider | **experimental** | your home folder, searched 4 levels deep (set it to your code folder) | `.aider.chat.history.md` in each repo: the latest run's `#### ` prompts, replies and the `> Tokens:` line | [groundedby.com Aider notes](https://groundedby.com/agents/aider), [Aider options](https://aider.chat/docs/config/options.html), [Aider args.py](https://github.com/Aider-AI/aider/blob/main/aider/args.py) |
| Cline | **experimental** | `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/tasks` (macOS and Windows paths in the code) | `<task>/ui_messages.json`: task, replies, follow-up questions, approvals, `api_req_started` token counts | [Cline ExtensionMessage.ts](https://github.com/cline/cline/blob/8a6441fd/src/shared/ExtensionMessage.ts), [session format notes](https://github.com/rajbos/ai-engineering-fluency/blob/main/docs/logFilesSchema/cline-session-format.md), [llm-usage-metrics](https://ayagmar.github.io/llm-usage-metrics/sources/cline/) |


**What "experimental" means here.** None of these tools promises a stable log format for outsiders (Gemini CLI and Cline are open source, so their record types are readable, but they can change). The Codex, Cursor, Gemini, Aider and Cline readers were written from the community format notes linked above and tested only with sample files built from those notes. The author has not run them against a real Codex or Cursor install. They may miss fields or break after a tool update. They are marked **beta** in the dashboard for that reason. If one misreads your logs, please open an issue (without pasting private code).

Cursor specifics: Raqeeb reads the plain-text transcript copy that the Cursor Agent keeps. That copy has no token counts, so Cursor cards show "no usage data". The editor's own sidebar chats live in a SQLite database (`state.vscdb`) and are **not** read. Gemini specifics: tokens are summed from each reply's `tokens` field (output includes reasoning tokens). Aider specifics: history lives inside each repo, so Raqeeb searches a folder tree (cached for a minute, `node_modules` and hidden tool folders skipped). Tokens come from Aider's quoted `> Tokens:` line, which I am least sure of, and a custom `--chat-history-file` name is not found. Cline specifics: reads the VS Code extension's task files only. Cline 4.x CLI sessions (`~/.cline/data/sessions`) are not read yet. Cline's own cost field is not used. Codex specifics: token counts come from the `token_count` events; Codex has no price table in Raqeeb, so it shows tokens only.

Want another tool? See [CONTRIBUTING.md](CONTRIBUTING.md#adding-an-agent-provider). It is one small file.

## Answer from the dashboard

For **Claude Code**, **Codex CLI** and **Aider**, a question card can have real buttons. Claude Code and Codex use their own `PermissionRequest` hook; Aider uses a wrapper.

How the hook route works: Raqeeb uses each tool's own `PermissionRequest` hook: the tool runs a small helper (`hook.js`) at the moment it would ask you, the helper asks this dashboard, and your click goes back as the answer.

| Tool | What you can do from the card | Source |
| --- | --- | --- |
| Claude Code | Approve or deny a permission prompt (including plan approval). Pick an option for a multiple-choice question (`AskUserQuestion`). | [hooks reference](https://code.claude.com/docs/en/hooks), [answering AskUserQuestion from a hook](https://dev.to/dawonlee/you-can-answer-claude-codes-askuserquestion-from-a-hook-and-from-your-phone-1ddn) |
| Codex CLI | Approve or deny an approval prompt. Questions are not supported. | [Codex hooks](https://learn.chatgpt.com/docs/hooks) |
| Aider | Yes/No confirmations (run this command, add this file, and so on), through a wrapper: start Aider with `raqeeb wrap aider`. Raqeeb reads Aider's own `(Y)es/(N)o` prompt and types your choice for you. | [Aider io.py](https://github.com/Aider-AI/aider/blob/main/aider/io.py) |
| Gemini CLI | Not supported. Its `BeforeTool` hook runs before every tool call and before Gemini's own policy check, and can only block it or force a terminal prompt. Its `Notification` hook is observe-only. Nothing lets another program answer the prompt itself. | [Gemini hooks](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md), [BeforeTool ask PR](https://github.com/google-gemini/gemini-cli/pull/21146) |
| Cursor | Not supported. `beforeShellExecution` fires for every shell command, not only the ones Cursor would ask about, and cannot answer Cursor's own approval prompt. | [Cursor hooks](https://cursor.com/docs/hooks) |
| Cline | Not supported yet. Cline's extension API can press its approve button, but that needs a small companion VS Code extension, which Raqeeb does not have. | |

Turn it on once per tool:

```
node server.js hooks install claude     # or: raqeeb hooks install claude
node server.js hooks install codex      # then open /hooks in Codex and trust the hook
node server.js hooks print claude       # just show the settings entry, change nothing
node server.js hooks uninstall claude
```

`install` adds one entry to `~/.claude/settings.json` (or `~/.codex/hooks.json`), keeps a `.raqeeb-backup` copy, leaves the file alone if it is not valid JSON, and is safe to run twice. Restart running sessions afterwards.

How it behaves, so nothing surprises you:

- **The terminal always still works.** If Raqeeb is not running, if no dashboard tab is open and visible, if you press **Answer in terminal instead**, or if 2 minutes pass, the helper prints nothing and the tool shows its normal prompt. The helper can never approve anything on its own.
- **Keep the dashboard tab visible** while you want to answer from it. A hidden browser tab may pause, and Raqeeb then hands prompts back to the terminal.
- **Whether the terminal prompt shows while the helper waits is not something Raqeeb controls or has verified.** If you answer in the terminal, the card disappears.
- Answers are checked: a question only accepts one of the offered options, and an approve button cannot answer a question.
- Security: the helper talks to `127.0.0.1` with a random token in `~/.raqeeb/hook.json` (readable only by you). The dashboard's answer endpoint accepts same-origin requests only. Pending prompts live in memory and are never written to disk.
- Not tested against a real Claude Code or Codex install. If a hook behaves differently on your version, please open an issue.

**Aider wrapper.** `node server.js wrap aider [aider arguments]` runs Aider in a pseudo-terminal you use as normal (needs `python3`, standard library only). When Aider's output ends in a `(Y)es/(N)o` prompt, the card appears with its real options (Yes, No, and All, Skip all or Don't ask again when Aider offers them). A click types that key. If you type in the terminal first, the card disappears. Only sessions started through the wrapper can be answered. Model-suggested shell commands still need an explicit yes in Aider and are shown the same way.

![Questions the dashboard can answer](docs/dashboard-answer.png)
![An Aider confirmation answered from the dashboard](docs/dashboard-aider.png)

## How it decides what an agent is doing

Raqeeb reads the session logs (`.jsonl` files) each tool writes, read-only, and never changes them. The same rules apply to every tool.

| Status | Rule |
| --- | --- |
| Working | the session file changed in the last 2 minutes |
| Idle | changed 2 to 30 minutes ago |
| Waiting on you | the last assistant message ends with a question mark, and is under 2 hours old |
| Done | nothing for 30 minutes and no open question |

Sessions untouched for 24 hours are hidden.

## Handoffs (new in 0.9.0)

The **Handoffs** button opens a notebook for each project. Write a note when you finish something (what was done, decided and still open), and press **Copy as prompt** to paste a clean context block into any agent that cannot read the board. Notes are plain Markdown files in `<your repo>/.raqeeb/handoff/`, so they travel with the project and you can commit, edit or delete them yourself.

- Raqeeb writes only in that folder, only when you press Save, and never edits any other file in your project (no `CLAUDE.md` or `AGENTS.md` changes).
- Each note records the branch and commit. A note is marked **older than the code** when a file it lists has changed since.
- Notes are capped at 2 KB, and a pattern check refuses saves that look like keys or passwords. It can miss some, so do not put secrets in notes.
- The prompt tells the agent to treat notes as background, not as instructions.
- Pinned notes sit at the top of a project ("we use pnpm").
- A project shows up once Raqeeb has seen an agent session in that folder in the last 24 hours.
- Not built yet: drafting a note from a finished session, a snippet for your rule file, and an MCP server so agents can read and write notes themselves.
- Tested with automated tests and a headless browser run. Not tested with real agents reading the notes yet.

## Honest limitations

- **Three tools for now.** Claude Code, Codex CLI, Cursor, Gemini CLI, Aider and Cline. Copilot agent mode, Windsurf, OpenCode, Amp and others are not read yet. Everything except Claude Code is experimental (see above).
- **Status is a guess.** It comes from file timestamps and whether the last message was a question. An agent that asks something without a question mark will look "idle" or "done". A long tool run with no output can look idle.
- **Cost is an estimate, and only where a rate is set.** Claude Code uses example per-token rates in [`lib/pricing.js`](lib/pricing.js), with cache reads not counted. The other five have no rates, so they show tokens (or "no usage data") and are left out of the dollar total, which says how many are unpriced. Rates change and plans differ, so treat the number as a rough guide, not a bill. Add rates in that file if you want them.
- **Answering works for three tools only.** Claude Code and Codex CLI after `raqeeb hooks install`, and Aider when started with `raqeeb wrap aider`. For Cursor, Gemini CLI and Cline Raqeeb still only watches, and the card says why (see [Answer from the dashboard](#answer-from-the-dashboard)). The Claude Code and Codex hooks were written from the tools' documentation and tested against a simulated hook caller, not a real install. The Aider wrapper was tested against a real Aider 0.86.2 (a Raqeeb click answered its prompt).
- **Tested with sample files, not real installs.** The automated tests use fixture files written from each tool's published format notes. Nothing has been checked against real Claude Code, Codex or Cursor logs yet. If your real logs look different and something shows wrong, please open an issue.

## Roadmap: Raqeeb Pro (not built yet)

The app stays free for non-commercial use. A paid layer is planned for people who run agents all day:

- Approve or redirect an agent from your phone
- Limits on which files and commands an agent may touch
- Alerts when a model's quality drops
- Team features (shared policies, audit log)

These do not exist yet and nothing in this repo is locked or phones home. If you want them, join the waitlist on the Raqeeb website and tell us what matters most.

## Development

```
npm test          # runs the automated tests (Node's built-in test runner)
npm run demo      # starts the app with sample data
```

Layout:

```
server.js         the HTTP server and command-line options
lib/sessions.js   combines all providers into one list
lib/providers/    one adapter per tool (claude, codex, cursor, gemini, aider, cline)
lib/common.js     shared scanning, status and parse cache
lib/pricing.js    example token rates (Claude only)
public/           the dashboard (plain HTML, CSS and JavaScript)
test/             automated tests
```

## Contributing

Issues and pull requests are welcome. By sending a pull request you agree that your contribution can be distributed under the same license. See [CONTRIBUTING.md](CONTRIBUTING.md). Good first things: an adapter for another coding agent (it is one file), better status detection, and real-session bug reports.

## Privacy and security

Raqeeb never sends data anywhere. It reads local files and serves a page on `127.0.0.1`. It only answers requests addressed to localhost, and the setup endpoint accepts same-origin requests only, so a web page you visit cannot change the folder. The files it writes are `~/.raqeeb/config.json` (the folder you chose) and `~/.raqeeb/hook.json` (port and a random token for the answer helper), plus a settings entry only when you run `raqeeb hooks install`. Session logs can contain your code and prompts, so do not expose the port to a network.

## License

Raqeeb is source-available, not open source. It is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE). You can use, read and change it for personal, hobby, research, educational and other non-commercial purposes, free. You may not use it for any commercial purpose (for example, inside a paid product or service, or at a company for its business) without separate permission from the author. Versions published before 0.8.1 were released under the MIT license, and copies already obtained under MIT keep that license.
