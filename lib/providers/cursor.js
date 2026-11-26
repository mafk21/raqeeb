'use strict';
// Cursor Agent (the cursor-agent CLI and the Agents window). Cursor mirrors each chat as a simplified JSON Lines transcript at
//   ~/.cursor/projects/<project-slug>/agent-transcripts/<chat-id>/<chat-id>.jsonl
// with one JSON object per line: role "user" or "assistant" and message content parts of type "text"/"tool_use".
// The full chat is in a SQLite file (~/.cursor/chats/<md5 of folder>/<chat-id>/store.db) which needs a SQLite reader, so
// Raqeeb does not read it. The editor's own chats live in state.vscdb and are NOT read either.
// Sources:
//   https://harnessnotes.com/session-transcripts/format  (Cursor Agent 2026.10.12: transcript path, jsonl role/type)
//   https://jazzyalex.github.io/agent-sessions/guides/cursor-agent-local-history.html
//   https://vibecorral.com/cursor-cli  (chats folder, meta.json, agent-transcripts mirror)
// The transcript has no token counts and no working directory, so Cursor shows no cost. Experimental: nothing here was checked
// against a real install, and the parser accepts several shapes (content as text or as a list of parts).
const fs = require('fs'), path = require('path'), os = require('os');
const { inspectFiles, readJsonl, makeScanner } = require('../common');

const isLog = (n, p) => n.endsWith('.jsonl') && p.split(path.sep).includes('agent-transcripts');
function defaultRoot() { return path.join(os.homedir(), '.cursor', 'projects'); }
function candidates() { return [defaultRoot()]; }
const textOf = c => typeof c === 'string' ? c : Array.isArray(c) ? c.filter(b => b && (b.type === 'text' || b.type === 'output_text' || b.type === 'input_text') && typeof b.text === 'string').map(b => b.text).join('\n') : '';
const bodyOf = j => textOf(j.message && j.message.content != null ? j.message.content : j.content != null ? j.content : j.text);
// Cursor wraps the user's words in <user_query> tags.
const clean = t => { const m = /<user_query>([\s\S]*?)<\/user_query>/.exec(t); return (m ? m[1] : t).trim(); };

function parse(file, st = fs.statSync(file)) {
  const parts = file.split(path.sep), i = parts.lastIndexOf('agent-transcripts');
  const slug = i > 0 ? parts[i - 1] : 'unknown';
  let task = '', lastSay = '', turns = 0, model = '';
  for (const j of readJsonl(file)) {
    const role = j.role || (j.message && j.message.role);
    if (j.model) model = j.model;
    if (role === 'user') { const t = clean(bodyOf(j)); if (t && !t.startsWith('<')) { if (!task) task = t; turns++; } }
    else if (role === 'assistant') { const t = bodyOf(j).trim(); if (t) lastSay = t; }
  }
  const project = slug.split('-').filter(Boolean).pop() || slug;
  return {
    id: path.basename(file, '.jsonl'), project, cwd: slug, branch: '', model, task: task.slice(0, 160), lastSay: lastSay.slice(0, 400),
    updated: st.mtimeMs, tokensIn: 0, tokensOut: 0, turns, cost: null, hasUsage: false
  };
}

module.exports = {
  id: 'cursor', name: 'Cursor', experimental: true, start: 'cursor-agent   (or use the Agents window in Cursor)',
  note: 'Reads ~/.cursor/projects/*/agent-transcripts. Shows chats from the Cursor Agent CLI and Agents window only, not the editor sidebar chat. Experimental.',
  defaultRoot, candidates, parse,
  inspect: (root, now) => inspectFiles(root, 3, isLog, now),
  scan: makeScanner({ depth: 3, match: isLog, parse })
};
