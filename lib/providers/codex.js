'use strict';
// OpenAI Codex CLI. Logs: $CODEX_HOME/sessions/YYYY/MM/DD/rollout-<time>-<uuid>.jsonl (CODEX_HOME defaults to ~/.codex).
// Each line is {timestamp, type, payload}; types: session_meta (first line: id, cwd, git, source), turn_context (model),
// event_msg (user_message, agent_message, token_count, task_started, task_complete), response_item (raw transcript).
// Sources:
//   https://github.com/neochoon/agenthud/blob/main/docs/schemas/codex-session.md  (empirical schema, Codex 0.121)
//   https://harnessnotes.com/session-transcripts/format  (Codex CLI 0.169.0, CODEX_HOME)
//   https://www.bough.run/articles/what-is-in-a-codex-rollout-file  (token usage fields; cached tokens are part of input)
// No official schema exists and it changes between versions, so this adapter is experimental and reads defensively.
const fs = require('fs'), path = require('path'), os = require('os');
const { inspectFiles, readJsonl, makeScanner } = require('../common');
const { costOf } = require('../pricing');

const isRollout = n => /^rollout-.*\.jsonl$/.test(n);
const home = () => process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
function defaultRoot() { return path.join(home(), 'sessions'); }
function candidates() { return [...new Set([defaultRoot(), path.join(os.homedir(), '.codex', 'sessions')])]; }

function parse(file, st = fs.statSync(file)) {
  let id = path.basename(file, '.jsonl').replace(/^rollout-.*?T[\d-]+-/, ''), cwd = '', branch = '', model = '', task = '', lastSay = '', turns = 0, tIn = 0, tOut = 0, cached = 0, sub = false;
  for (const r of readJsonl(file)) {
    const p = r.payload || {};
    if (r.type === 'session_meta') {
      if (p.id) id = p.id; if (p.cwd) cwd = p.cwd; if (p.git && p.git.branch) branch = p.git.branch;
      if (p.source && typeof p.source === 'object' && p.source.subagent) sub = true;
      if (p.parent_thread_id) sub = true;
    } else if (r.type === 'turn_context') {
      if (p.model) model = p.model; if (p.cwd && !cwd) cwd = p.cwd;
    } else if (r.type === 'event_msg') {
      if (p.type === 'user_message' && typeof p.message === 'string') {
        const t = p.message.trim();
        if (t && !t.startsWith('<environment_context>')) { if (!task) task = t; turns++; }
      } else if (p.type === 'agent_message' && typeof p.message === 'string' && p.message.trim()) lastSay = p.message.trim();
      else if (p.type === 'token_count' && p.info && p.info.total_token_usage) {
        const u = p.info.total_token_usage;
        tIn = u.input_tokens || 0; tOut = (u.output_tokens || 0); cached = u.cached_input_tokens || 0;
      }
    } else if (r.type === 'response_item' && p.type === 'message' && p.role === 'assistant' && Array.isArray(p.content)) {
      const t = p.content.filter(b => b && b.type === 'output_text').map(b => b.text).join('\n').trim();
      if (t && !lastSay) lastSay = t;
    }
  }
  if (sub) return null; // sub-agent runs are separate rollout files; only the parent session is shown
  return {
    id, project: path.basename(cwd || 'unknown'), cwd, branch, model, task: task.slice(0, 160), lastSay: lastSay.slice(0, 400),
    updated: st.mtimeMs, tokensIn: tIn, tokensOut: tOut, cachedIn: cached, turns, cost: costOf(model, tIn - cached, tOut), hasUsage: tIn + tOut > 0
  };
}

module.exports = {
  id: 'codex', name: 'Codex CLI', experimental: true, start: 'cd your-project\ncodex',
  note: 'Reads ~/.codex/sessions (or $CODEX_HOME/sessions). Built from published format notes, not yet checked against a real install.',
  defaultRoot, candidates, parse,
  inspect: (root, now) => inspectFiles(root, 4, isRollout, now),
  scan: makeScanner({ depth: 4, match: isRollout, parse })
};
