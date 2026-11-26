# Contributing to Raqeeb

Thanks for helping. This is a small project, so the rules are short.

## Set up

You need Node.js 18 or newer. There is nothing to install.

```
git clone https://github.com/mafk21/raqeeb.git
cd raqeeb
npm test
npm run demo
```

## Ground rules

- Keep it dependency-free. If you think you need a package, open an issue first.
- Keep it local. The app must not send data anywhere and must keep listening on `127.0.0.1` only.
- Keep it read-only. Raqeeb must never modify an agent's session files.
- Add or update a test in `test/` for any change in `lib/` or `server.js`.
- Run `npm test` before you open a pull request.

## Adding another agent

Session reading lives in `lib/sessions.js`. A new agent needs a parser that returns the same card shape (`id`, `tool`, `project`, `branch`, `task`, `lastSay`, `question`, `status`, `updated`, `tokensIn`, `tokensOut`, `cost`). Include a small sample log file in your test so the format is documented.

## Reporting bugs

Open an issue with what you expected, what you saw, your Node version and OS. If a session shows the wrong status, describe how the agent's last message ended. Do not paste private code or prompts from your logs.
