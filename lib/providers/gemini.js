'use strict';
// Gemini CLI (Google). Chats: ~/.gemini/tmp/<project-id>/chats/session-*.json or .jsonl
// (GEMINI_CLI_HOME, when set, replaces the home folder: <GEMINI_CLI_HOME>/.gemini/tmp).
// Two generations coexist: one JSON document {sessionId, startTime, lastUpdated, messages[]}, or JSON Lines whose first line
// carries the session fields and later lines are messages. A message is {id, timestamp, type: "user"|"gemini"|"info"|..., content}
// where content is a string or a list of {text}; "gemini" messages can carry model and tokens {input, output, cached, thoughts, total}.
// Sources:
//   https://github.com/google-gemini/gemini-cli/blob/f8541cf7/packages/core/src/services/chatRecordingTypes.ts  (record types)
//   https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/services/chatRecordingService.ts  (chats folder)
//   https://geminicli.com/docs/cli/session-management/  (location, saved fields)
//   https://vshulcz.github.io/deja-vu/registry/gemini.html  (the two file generations, projects.json / .project_root)
// Experimental: read from those sources, not checked against a real install.
const fs = require('fs'), path = require('path'), os = require('os');
const { inspectFiles, readJsonl, makeScanner } = require('../common');

const isChat = (n, p) => /^session-.*\.jsonl?$/.test(n) && path.basename(path.dirname(p)) === 'chats';
const home = () => process.env.GEMINI_CLI_HOME ? path.join(process.env.GEMINI_CLI_HOME, '.gemini') : path.join(os.homedir(), '.gemini');
const defaultRoot = () => path.join(home(), 'tmp');
const candidates = () => [...new Set([defaultRoot(), path.join(os.homedir(), '.gemini', 'tmp')])];
const textOf = c => typeof c === 'string' ? c : Array.isArray(c) ? c.map(b => (b && typeof b.text === 'string') ? b.text : '').join('\n') : c && typeof c.text === 'string' ? c.text : '';

function load(file) {
  if (file.endsWith('.jsonl')) {
    const rows = readJsonl(file); const meta = rows.find(r => r.sessionId) || {};
    return { ...meta, messages: rows.filter(r => r.type && r.content !== undefined) };
  }
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}

function parse(file, st = fs.statSync(file)) {
  const d = load(file);
  if (d.kind === 'subagent') return null;
  const dir = path.dirname(path.dirname(file));
  let cwd = '';
  try { cwd = fs.readFileSync(path.join(dir, '.project_root'), 'utf8').trim(); } catch {}
  if (!cwd && Array.isArray(d.directories) && d.directories[0]) cwd = d.directories[0];
  let task = '', lastSay = '', model = '', tIn = 0, tOut = 0, turns = 0;
  for (const m of d.messages || []) {
    if (!m || typeof m !== 'object') continue;
    if (m.type === 'user') { const t = textOf(m.content).trim(); if (t) { if (!task) task = t; turns++; } }
    else if (m.type === 'gemini') {
      const t = textOf(m.content).trim(); if (t) lastSay = t;
      if (m.model) model = m.model;
      if (m.tokens) { tIn += m.tokens.input || 0; tOut += (m.tokens.output || 0) + (m.tokens.thoughts || 0); }
    }
  }
  return {
    id: d.sessionId || path.basename(file).replace(/\.jsonl?$/, ''), project: cwd ? path.basename(cwd) : path.basename(dir), cwd: cwd || dir, branch: '',
    model, task: task.slice(0, 160), lastSay: lastSay.slice(0, 400), updated: st.mtimeMs, tokensIn: tIn, tokensOut: tOut, turns, cost: null, hasUsage: tIn + tOut > 0
  };
}

module.exports = {
  id: 'gemini', name: 'Gemini CLI', experimental: true, start: 'cd your-project\ngemini',
  note: 'Reads ~/.gemini/tmp/*/chats (or $GEMINI_CLI_HOME/.gemini/tmp). Built from published format notes, not yet checked against a real install. No price rate, so tokens only.',
  defaultRoot, candidates, parse,
  inspect: (root, now) => inspectFiles(root, 3, isChat, now),
  scan: makeScanner({ depth: 3, match: isChat, parse })
};
