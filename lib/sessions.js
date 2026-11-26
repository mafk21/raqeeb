'use strict';
// Reads Claude Code session files (JSONL) and turns them into agent cards.
const fs = require('fs'), path = require('path'), os = require('os');
const { costOf } = require('./pricing');

const ACTIVE_MS = 2 * 60 * 1000;       // written to in the last 2 min: working
const IDLE_MS = 30 * 60 * 1000;        // up to 30 min: idle
const WAIT_MS = 2 * 60 * 60 * 1000;    // a question older than 2 h is no longer "waiting"
const MAX_AGE_MS = 24 * 3600 * 1000;   // sessions untouched for 24 h are hidden

function defaultRoot() {
  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(base, 'projects');
}

// Places Claude Code keeps its session logs, in the order we suggest them.
function candidates() {
  const home = os.homedir(), out = [];
  if (process.env.CLAUDE_CONFIG_DIR) out.push(path.join(process.env.CLAUDE_CONFIG_DIR, 'projects'));
  out.push(path.join(home, '.claude', 'projects'), path.join(home, '.config', 'claude', 'projects'));
  return [...new Set(out)];
}

// Look at a folder without reading any session: does it exist, how many session files does it hold?
function inspect(root, now = Date.now()) {
  const r = { path: root, exists: false, isDir: false, projects: 0, files: 0, recent: 0 };
  let st; try { st = fs.statSync(root); } catch { return r; }
  r.exists = true; r.isDir = st.isDirectory();
  if (!r.isDir) return r;
  let dirs = []; try { dirs = fs.readdirSync(root); } catch { return r; }
  for (const d of dirs) {
    let files = []; try { files = fs.readdirSync(path.join(root, d)).filter(f => f.endsWith('.jsonl')); } catch { continue; }
    if (files.length) r.projects++;
    for (const f of files) { r.files++; try { if (now - fs.statSync(path.join(root, d, f)).mtimeMs <= MAX_AGE_MS) r.recent++; } catch {} }
  }
  return r;
}

function textOf(c) {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.filter(b => b && b.type === 'text').map(b => b.text).join('\n');
  return '';
}

function classify(lastSay, ageMs) {
  const asksQuestion = /\?\s*$/.test(lastSay.trim());
  if (asksQuestion && ageMs < WAIT_MS) return { status: 'waiting', asksQuestion };
  if (ageMs < ACTIVE_MS) return { status: 'working', asksQuestion };
  if (ageMs < IDLE_MS) return { status: 'idle', asksQuestion };
  return { status: 'done', asksQuestion };
}

function parseSession(file, now = Date.now()) {
  const st = fs.statSync(file);
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  let cwd = '', task = '', lastSay = '', tokensIn = 0, tokensOut = 0, model = '', turns = 0, branch = '', cost = 0;
  for (const l of lines) {
    let j; try { j = JSON.parse(l); } catch { continue; }
    if (j.isSidechain) continue;
    if (j.cwd) cwd = j.cwd;
    if (j.gitBranch) branch = j.gitBranch;
    const m = j.message;
    if (!m) continue;
    if (j.type === 'user') {
      const t = textOf(m.content).trim();
      if (t && !t.startsWith('<')) { if (!task) task = t; turns++; }
    } else if (j.type === 'assistant') {
      const t = textOf(m.content).trim();
      if (t) lastSay = t;
      if (m.model) model = m.model;
      if (m.usage) {
        const i = (m.usage.input_tokens || 0) + (m.usage.cache_creation_input_tokens || 0), o = m.usage.output_tokens || 0;
        tokensIn += i; tokensOut += o; cost += costOf(m.model || model, i, o);
      }
    }
  }
  const age = now - st.mtimeMs;
  const { status, asksQuestion } = classify(lastSay, age);
  return {
    id: path.basename(file, '.jsonl'), tool: 'Claude Code', project: path.basename(cwd || 'unknown'), cwd, branch, model,
    task: task.slice(0, 160), lastSay: lastSay.slice(0, 400), question: asksQuestion && status === 'waiting' ? lastSay.slice(-300) : '',
    status, updated: st.mtimeMs, tokensIn, tokensOut, turns, cost
  };
}

const cache = new Map(); // file -> { key, session }
function scan(root = defaultRoot(), now = Date.now()) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const d of fs.readdirSync(root)) {
    const dir = path.join(root, d);
    let files = []; try { files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')); } catch { continue; }
    for (const f of files) {
      const p = path.join(dir, f);
      let st; try { st = fs.statSync(p); } catch { continue; }
      if (now - st.mtimeMs > MAX_AGE_MS) continue;
      const key = st.mtimeMs + ':' + st.size, hit = cache.get(p);
      try {
        // status depends on age, so re-classify cached parses instead of reusing the status
        const s = hit && hit.key === key ? hit.session : parseSession(p, now);
        if (!hit || hit.key !== key) cache.set(p, { key, session: s });
        const lastSay = s.lastSay, c = classify(lastSay, now - s.updated);
        out.push({ ...s, status: c.status, question: c.asksQuestion && c.status === 'waiting' ? lastSay.slice(-300) : '' });
      } catch {}
    }
  }
  return out.sort((a, b) => b.updated - a.updated);
}

function demo(now = Date.now()) {
  const m = 60000;
  const mk = (i, project, branch, task, say, q, status, ago, ti, to) => ({ id: 'demo' + i, tool: 'Claude Code', project, cwd: '~/code/' + project, branch, model: 'claude-sonnet', task, lastSay: say, question: q, status, updated: now - ago * m, tokensIn: ti, tokensOut: to, turns: 6 + i, cost: (ti * 3 + to * 15) / 1e6, demo: true });
  return [
    mk(1, 'checkout-api', 'fix/stripe-webhooks', 'Make the webhook handler idempotent and add retries', 'Retries added with exponential backoff. 14 of 15 tests pass.', 'Should I delete the legacy /v1/hooks route, or keep it behind a flag?', 'waiting', 3, 182000, 21000),
    mk(2, 'mobile-app', 'feat/offline-sync', 'Add offline queue for form submissions', 'Writing the sync queue now, touching storage.ts and queue.ts.', '', 'working', 0.4, 240000, 36000),
    mk(3, 'docs-site', 'chore/search', 'Replace the search index with a static one', 'Index builds in 2s. Waiting on nothing.', '', 'idle', 12, 64000, 9000),
    mk(4, 'billing-service', 'refactor/invoices', 'Split invoice rendering into its own module', 'Done. 31 files changed, all tests green.', '', 'done', 95, 420000, 58000),
    mk(5, 'infra', 'main', 'Upgrade Node to 22 in all Dockerfiles', 'I found 3 services pinned to Node 18. Upgrade them too?', 'I found 3 services pinned to Node 18. Upgrade them too?', 'waiting', 7, 51000, 6000)
  ];
}

module.exports = { parseSession, scan, demo, classify, defaultRoot, candidates, inspect, ACTIVE_MS, IDLE_MS, WAIT_MS };
