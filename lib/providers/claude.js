'use strict';
// Claude Code. Logs: <config dir>/projects/<project>/<session>.jsonl, one JSON object per line.
// Sources: Claude Code docs for the location (~/.claude, CLAUDE_CONFIG_DIR) and the open session-format notes at
// https://harnessnotes.com/session-transcripts/format (records: user, assistant with message.usage, isSidechain).
const fs = require('fs'), path = require('path'), os = require('os');
const { inspectFiles, readJsonl, makeScanner } = require('../common');
const { costOf } = require('../pricing');

const isLog = n => n.endsWith('.jsonl');
const textOf = c => typeof c === 'string' ? c : Array.isArray(c) ? c.filter(b => b && b.type === 'text').map(b => b.text).join('\n') : '';

function defaultRoot() { return path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects'); }
function candidates() {
  const h = os.homedir(), out = [];
  if (process.env.CLAUDE_CONFIG_DIR) out.push(path.join(process.env.CLAUDE_CONFIG_DIR, 'projects'));
  out.push(path.join(h, '.claude', 'projects'), path.join(h, '.config', 'claude', 'projects'));
  return [...new Set(out)];
}

function parse(file, st = fs.statSync(file)) {
  let cwd = '', task = '', lastSay = '', tokensIn = 0, tokensOut = 0, model = '', turns = 0, branch = '', cost = 0, priced = false;
  for (const j of readJsonl(file)) {
    if (j.isSidechain) continue;
    if (j.cwd) cwd = j.cwd;
    if (j.gitBranch) branch = j.gitBranch;
    const m = j.message; if (!m) continue;
    if (j.type === 'user') {
      const t = textOf(m.content).trim();
      if (t && !t.startsWith('<')) { if (!task) task = t; turns++; }
    } else if (j.type === 'assistant') {
      const t = textOf(m.content).trim(); if (t) lastSay = t;
      if (m.model) model = m.model;
      if (m.usage) {
        const i = (m.usage.input_tokens || 0) + (m.usage.cache_creation_input_tokens || 0), o = m.usage.output_tokens || 0;
        tokensIn += i; tokensOut += o;
        const c = costOf(m.model || model, i, o); if (c != null) { cost += c; priced = true; }
      }
    }
  }
  return {
    id: path.basename(file, '.jsonl'), project: path.basename(cwd || 'unknown'), cwd, branch, model,
    task: task.slice(0, 160), lastSay: lastSay.slice(0, 400), updated: st.mtimeMs, tokensIn, tokensOut, turns,
    cost: priced ? cost : null, hasUsage: tokensIn + tokensOut > 0
  };
}

module.exports = {
  id: 'claude', name: 'Claude Code', experimental: false, start: 'cd your-project\nclaude',
  note: 'Reads ~/.claude/projects (or $CLAUDE_CONFIG_DIR/projects).',
  defaultRoot, candidates, parse,
  inspect: (root, now) => inspectFiles(root, 1, isLog, now),
  scan: makeScanner({ depth: 1, match: isLog, parse })
};
