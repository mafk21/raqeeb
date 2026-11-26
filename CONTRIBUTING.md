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

## Adding an agent provider

Each tool is one file in `lib/providers/`. Copy `codex.js` (the closest to a typical JSON Lines log) and change it.

1. Create `lib/providers/<id>.js` that exports this object:

```js
module.exports = {
  id: 'mytool',                 // short, lowercase, used in URLs and config
  name: 'My Tool',              // shown in the UI
  experimental: true,           // true unless you checked it against a real install
  start: 'mytool',              // command shown on the setup screen
  note: 'Reads ~/.mytool/logs. ...', // one or two honest sentences
  defaultRoot() {},             // default folder (string)
  candidates() {},              // other folders worth suggesting (array of strings)
  parse(file, stat) {},         // one log file -> card fields, or null to skip it
  inspect(root, now) {},        // { exists, isDir, files, recent } for the setup screen
  scan(root, now) {}            // recent cards, newest first
};
```

2. `parse` returns: `id`, `project`, `cwd`, `branch`, `model`, `task`, `lastSay`, `updated` (ms), `tokensIn`, `tokensOut`, `turns`, `cost` and `hasUsage`. Use `cost: null` when you have no price rate. Never guess a price or token count. Leave fields empty (`''`, `0`) when the log does not have them.
   Optional: return `asking: true` from `parse` when the tool itself is waiting on the user (approvals, follow-up questions); the card then shows Waiting without needing a question mark. See `cline.js`.
3. You rarely need to write `inspect` and `scan` yourself. Use the helpers in `lib/common.js`: `inspectFiles(root, depth, matchFn, now)`, `makeScanner({ depth, match, parse })` (adds status, caches parses by mtime and size, hides sessions older than 24 hours; pass `ttl` to cache the file list for wide roots) and `readJsonl(file)` (skips bad lines).
4. Register it in `lib/providers/index.js`.
5. Put a comment at the top of the file with the log location and **links to the sources you based the format on**. If you did not test with a real install, keep `experimental: true`.
6. Add fixture helpers and tests in `test/` (see `test/helpers.js` and `test/providers.test.js`). Fixtures should be small files that document the format you read. The UI, badges, filter chips, setup panel and spend panels pick the new provider up automatically. Add a colour for its badge in `public/style.css` (`.t-<id>`) if you want one.
7. Add a row to the table in the README.

## Reporting bugs

Open an issue with what you expected, what you saw, your Node version and OS. If a session shows the wrong status, describe how the agent's last message ended. Do not paste private code or prompts from your logs.
