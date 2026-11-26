# Raqeeb (رقيب)

A local control room for the AI coding agents you run. Raqeeb means "watcher" in Arabic.

It shows every Claude Code session on your machine: what each agent is working on, which ones are waiting on an answer from you, and a rough cost estimate. Everything stays on your computer.

## Run it

Needs Node 18 or newer. No dependencies, no install step.

```
node server.js          # reads your real sessions
node server.js --demo   # sample data, to look around
```

Then open http://localhost:4317. Set `PORT` to use another port.

## How it works

- Reads the session files Claude Code already writes to `~/.claude/projects`. Read-only.
- Serves a small dashboard on `127.0.0.1` only. It is not reachable from other machines.
- No accounts, no telemetry, nothing uploaded.

## Limits today

- Claude Code only.
- Status is a guess from file timestamps and whether the last message was a question. It can be wrong.
- Cost is an estimate from token counts with fixed example prices, not a bill.

## Pro (not built yet)

Phone approvals, limits on files and commands, and model quality alerts are planned as a paid layer. Join the waitlist on the website. Nothing in this repo is locked or phones home.

## License

MIT
