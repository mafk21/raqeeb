#!/usr/bin/env node
// Raqeeb: local dashboard for AI coding agent sessions. Zero dependencies.
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const PORT = +(process.env.PORT || 4317);
const DEMO = process.argv.includes('--demo');
const ROOT = path.join(os.homedir(), '.claude', 'projects');
const ACTIVE_MS = 2 * 60 * 1000, IDLE_MS = 30 * 60 * 1000;

function textOf(c) {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.filter(b => b && b.type === 'text').map(b => b.text).join('\n');
  return '';
}
function parseSession(file) {
  const st = fs.statSync(file);
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  let cwd = '', task = '', lastSay = '', tokensIn = 0, tokensOut = 0, model = '', turns = 0, branch = '';
  for (const l of lines) {
    let j; try { j = JSON.parse(l); } catch { continue; }
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
      if (m.usage) { tokensIn += (m.usage.input_tokens || 0) + (m.usage.cache_creation_input_tokens || 0); tokensOut += m.usage.output_tokens || 0; }
    }
  }
  const age = Date.now() - st.mtimeMs;
  const asksQuestion = /\?\s*$/.test(lastSay.trim());
  const status = asksQuestion && age < IDLE_MS * 4 ? 'waiting' : age < ACTIVE_MS ? 'working' : age < IDLE_MS ? 'idle' : 'done';
  return {
    id: path.basename(file, '.jsonl'), tool: 'Claude Code', project: path.basename(cwd || 'unknown'), cwd, branch, model,
    task: task.slice(0, 160), lastSay: lastSay.slice(0, 400), question: asksQuestion ? lastSay.slice(-300) : '',
    status, updated: st.mtimeMs, tokensIn, tokensOut, turns
  };
}
function scan() {
  if (DEMO || !fs.existsSync(ROOT)) return demo();
  const out = [];
  for (const d of fs.readdirSync(ROOT)) {
    const dir = path.join(ROOT, d);
    let files = []; try { files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')); } catch { continue; }
    for (const f of files) {
      const p = path.join(dir, f);
      if (Date.now() - fs.statSync(p).mtimeMs > 24 * 3600 * 1000) continue;
      try { out.push(parseSession(p)); } catch {}
    }
  }
  return out.length ? out.sort((a, b) => b.updated - a.updated) : demo();
}
function demo() {
  const n = Date.now(), m = 60000;
  const mk = (i, project, branch, task, say, q, status, ago, ti, to) => ({ id: 'demo' + i, tool: 'Claude Code', project, cwd: '~/code/' + project, branch, model: 'claude-sonnet', task, lastSay: say, question: q, status, updated: n - ago * m, tokensIn: ti, tokensOut: to, turns: 6 + i, demo: true });
  return [
    mk(1, 'checkout-api', 'fix/stripe-webhooks', 'Make the webhook handler idempotent and add retries', 'Retries added with exponential backoff. 14 of 15 tests pass.', 'Should I delete the legacy /v1/hooks route, or keep it behind a flag?', 'waiting', 3, 182000, 21000),
    mk(2, 'mobile-app', 'feat/offline-sync', 'Add offline queue for form submissions', 'Writing the sync queue now, touching storage.ts and queue.ts.', '', 'working', 0.4, 240000, 36000),
    mk(3, 'docs-site', 'chore/search', 'Replace the search index with a static one', 'Index builds in 2s. Waiting on nothing.', '', 'idle', 12, 64000, 9000),
    mk(4, 'billing-service', 'refactor/invoices', 'Split invoice rendering into its own module', 'Done. 31 files changed, all tests green.', '', 'done', 95, 420000, 58000),
    mk(5, 'infra', 'main', 'Upgrade Node to 22 in all Dockerfiles', 'I found 3 services pinned to Node 18. Upgrade them too?', 'I found 3 services pinned to Node 18. Upgrade them too?', 'waiting', 7, 51000, 6000)
  ];
}

const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
  if (req.url.startsWith('/api/agents')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ agents: scan(), demo: DEMO || !fs.existsSync(ROOT), now: Date.now() }));
  }
  const f = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url.split('?')[0].replace(/\.\./g, ''));
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`Raqeeb running at http://localhost:${PORT}` + (DEMO ? ' (demo data)' : '')));
