'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), http = require('http'), { spawn } = require('child_process');
const h = require('./helpers');
const { createServer } = require('../server');
const hooks = require('../lib/hooks');
const NONE = Object.fromEntries(['claude', 'codex', 'cursor', 'gemini', 'aider', 'cline'].map(k => [k, '/nonexistent/raqeeb/' + k]));
async function start() {
  process.env.RAQEEB_HOME = h.tmp('raqeeb-home-');
  const s = createServer({ dirs: NONE, demo: false }); await new Promise(r => s.listen(0, '127.0.0.1', r));
  const port = s.address().port, cfg = JSON.parse(fs.readFileSync(path.join(process.env.RAQEEB_HOME, 'hook.json'), 'utf8'));
  return { s, port, cfg, home: process.env.RAQEEB_HOME, close: () => { s.closeAllConnections(); s.close(); } };
}
const post = (port, p, body, headers) => h.req(port, p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, data: JSON.stringify(body) });
const dash = (port, p, body) => post(port, p, body, { Origin: 'http://localhost:' + port, Host: 'localhost:' + port });
const view = port => h.req(port, '/api/prompts', { headers: { Host: 'localhost:' + port } });
const Q = { session_id: 's1', cwd: '/home/dev/shop', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: 'Which color?', header: 'Color', multiSelect: false, options: [{ label: 'Red', description: 'r' }, { label: 'Blue', description: 'b' }] }] } };
const B = { session_id: 's2', cwd: '/home/dev/api', tool_name: 'Bash', tool_input: { command: 'npm test', description: 'run tests' } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function runHook(tool, payload, env) {
  return new Promise(res => { const c = spawn(process.execPath, [path.join(__dirname, '..', 'hook.js'), tool], { env: { ...process.env, ...env } }); let o = ''; c.stdout.on('data', d => o += d); c.on('close', code => res({ code, out: o })); c.stdin.end(JSON.stringify(payload)); });
}

test('hook request: refused without the token or with an Origin header', async () => {
  const t = await start();
  assert.equal((await post(t.port, '/api/hook/request', { tool: 'claude', payload: B })).code, 403);
  assert.equal((await post(t.port, '/api/hook/request', { tool: 'claude', payload: B }, { 'X-Raqeeb-Token': 'x'.repeat(48) })).code, 403);
  assert.equal((await post(t.port, '/api/hook/request', { tool: 'claude', payload: B }, { 'X-Raqeeb-Token': t.cfg.token, Origin: 'http://evil.example' })).code, 403);
  t.close();
});

test('hook request: nobody watching the dashboard returns no decision at once', async () => {
  const t = await start();
  const r = await post(t.port, '/api/hook/request', { tool: 'claude', payload: B, wait: 30 }, { 'X-Raqeeb-Token': t.cfg.token });
  assert.equal(r.code, 200); assert.deepEqual(JSON.parse(r.body), { decision: null, reason: 'no-viewer' }); t.close();
});

test('permission: dashboard allow and deny reach the hook; wrong origin and bad answers are refused', async () => {
  const t = await start(); await view(t.port);
  const ask = () => post(t.port, '/api/hook/request', { tool: 'codex', payload: B, wait: 20 }, { 'X-Raqeeb-Token': t.cfg.token });
  let p = ask(); await sleep(150);
  const l = JSON.parse((await view(t.port)).body).prompts; assert.equal(l.length, 1);
  assert.equal(l[0].kind, 'permission'); assert.equal(l[0].detail, 'npm test'); assert.equal(l[0].tool, 'codex');
  const path_ = `/api/prompts/${l[0].id}/answer`;
  assert.equal((await post(t.port, path_, { action: 'allow' })).code, 403, 'no Origin');
  assert.equal((await post(t.port, path_, { action: 'allow' }, { Origin: 'http://evil.example' })).code, 403);
  assert.equal((await dash(t.port, path_, { action: 'answer', answers: {} })).code, 400, 'wrong action for a permission');
  assert.equal((await dash(t.port, path_, { action: 'allow' })).code, 200);
  assert.deepEqual(JSON.parse((await p).body).decision, { behavior: 'allow' });
  assert.equal(JSON.parse((await view(t.port)).body).prompts.length, 0);
  assert.equal((await dash(t.port, path_, { action: 'allow' })).code, 404, 'already answered');
  p = ask(); await sleep(150); const id = JSON.parse((await view(t.port)).body).prompts[0].id;
  await dash(t.port, `/api/prompts/${id}/answer`, { action: 'deny' });
  assert.equal(JSON.parse((await p).body).decision.behavior, 'deny'); t.close();
});

test('question: answers must match the offered options; the hook gets updatedInput.answers', async () => {
  const t = await start(); await view(t.port);
  const p = post(t.port, '/api/hook/request', { tool: 'claude', payload: Q, wait: 20 }, { 'X-Raqeeb-Token': t.cfg.token }); await sleep(150);
  const it = JSON.parse((await view(t.port)).body).prompts[0]; assert.equal(it.kind, 'question'); assert.equal(it.questions[0].options.length, 2);
  const ap = `/api/prompts/${it.id}/answer`;
  assert.equal((await dash(t.port, ap, { action: 'answer', answers: { 'Which color?': 'Green' } })).code, 400);
  assert.equal((await dash(t.port, ap, { action: 'allow' })).code, 400, 'allow alone would leave the question open');
  assert.equal((await dash(t.port, ap, { action: 'answer', answers: { 'Which color?': 'Blue' } })).code, 200);
  const d = JSON.parse((await p).body).decision;
  assert.equal(d.behavior, 'allow'); assert.deepEqual(d.updatedInput.answers, { 'Which color?': 'Blue' }); assert.equal(d.updatedInput.questions.length, 1); t.close();
});

test('codex questions are shown as permissions only; "terminal" and a closed hook both clear the card', async () => {
  const t = await start(); await view(t.port);
  let p = post(t.port, '/api/hook/request', { tool: 'codex', payload: Q, wait: 20 }, { 'X-Raqeeb-Token': t.cfg.token }); await sleep(150);
  let it = JSON.parse((await view(t.port)).body).prompts[0]; assert.equal(it.kind, 'permission');
  await dash(t.port, `/api/prompts/${it.id}/answer`, { action: 'terminal' });
  assert.equal(JSON.parse((await p).body).decision, null);
  const c = http.request({ port: t.port, host: '127.0.0.1', path: '/api/hook/request', method: 'POST', agent: false, headers: { 'Content-Type': 'application/json', 'X-Raqeeb-Token': t.cfg.token } });
  c.on('error', () => {}); c.end(JSON.stringify({ tool: 'claude', payload: B, wait: 60 })); await sleep(200);
  assert.equal(JSON.parse((await view(t.port)).body).prompts.length, 1); c.destroy(); await sleep(200);
  assert.equal(JSON.parse((await view(t.port)).body).prompts.length, 0, 'agent answered in the terminal, card removed'); t.close();
});

test('hook.js: prints the decision for Claude Code, and prints nothing when Raqeeb is unreachable', async () => {
  const t = await start(); await view(t.port);
  const run = runHook('claude', Q, { RAQEEB_HOME: t.home, RAQEEB_HOOK_WAIT: '20' }); await sleep(500);
  const it = JSON.parse((await view(t.port)).body).prompts[0];
  await dash(t.port, `/api/prompts/${it.id}/answer`, { action: 'answer', answers: { 'Which color?': 'Red' } });
  const r = await run, o = JSON.parse(r.out);
  assert.equal(r.code, 0); assert.equal(o.hookSpecificOutput.hookEventName, 'PermissionRequest'); assert.equal(o.hookSpecificOutput.decision.updatedInput.answers['Which color?'], 'Red');
  t.close();
  const gone = await runHook('claude', B, { RAQEEB_HOME: t.home }); assert.equal(gone.code, 0); assert.equal(gone.out, '');
  const nofile = await runHook('codex', B, { RAQEEB_HOME: h.tmp() }); assert.equal(nofile.code, 0); assert.equal(nofile.out, '');
  const bad = await runHook('cursor', B, { RAQEEB_HOME: t.home }); assert.equal(bad.out, '');
});

test('hooks install: merges into existing settings, keeps a backup, is idempotent, and uninstalls cleanly', () => {
  const dir = h.tmp(); process.env.CLAUDE_CONFIG_DIR = dir; const f = path.join(dir, 'settings.json');
  fs.writeFileSync(f, JSON.stringify({ model: 'x', hooks: { PermissionRequest: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'mine.sh' }] }], Stop: [] } }));
  assert.equal(hooks.status('claude').installed, false);
  const r = hooks.install('claude'); assert.equal(r.changed, true); assert.ok(fs.existsSync(f + '.raqeeb-backup'));
  let j = JSON.parse(fs.readFileSync(f, 'utf8')); assert.equal(j.model, 'x'); assert.equal(j.hooks.PermissionRequest.length, 2); assert.equal(j.hooks.PermissionRequest[0].hooks[0].command, 'mine.sh');
  assert.equal(hooks.status('claude').installed, true); assert.equal(hooks.install('claude').changed, false);
  assert.equal(hooks.uninstall('claude').changed, true);
  j = JSON.parse(fs.readFileSync(f, 'utf8')); assert.equal(j.hooks.PermissionRequest.length, 1); assert.equal(j.hooks.PermissionRequest[0].hooks[0].command, 'mine.sh');
  fs.writeFileSync(f, '{ not json'); assert.throws(() => hooks.install('claude')); assert.equal(fs.readFileSync(f, 'utf8'), '{ not json', 'invalid file left untouched');
  assert.equal(hooks.status('gemini').supported, false); assert.match(hooks.status('cursor').why, /every shell command/);
  delete process.env.CLAUDE_CONFIG_DIR;
});
