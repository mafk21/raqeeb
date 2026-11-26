'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { parseSession, scan, classify } = require('../lib/sessions');
const { costOf } = require('../lib/pricing');
const { createServer, parseArgs } = require('../server');

// Sample files follow the shape of Claude Code's session logs: one JSON object per line.
function line(o) { return JSON.stringify(o); }
function writeSession(root, proj, name, rows, ageMs = 0) {
  const dir = path.join(root, proj); fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, name + '.jsonl'); fs.writeFileSync(f, rows.map(line).join('\n') + '\n');
  const t = new Date(Date.now() - ageMs); fs.utimesSync(f, t, t); return f;
}
const user = (text, extra = {}) => ({ type: 'user', cwd: '/home/dev/shop', gitBranch: 'feat/cart', message: { role: 'user', content: text }, ...extra });
const asst = (text, extra = {}) => ({ type: 'assistant', cwd: '/home/dev/shop', message: { role: 'assistant', model: 'claude-sonnet-4', content: [{ type: 'text', text }], usage: { input_tokens: 1000, cache_creation_input_tokens: 500, output_tokens: 200 } }, ...extra });

test('parses task, branch, project, tokens and cost', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'raqeeb-'));
  const f = writeSession(root, '-home-dev-shop', 's1', [user('Add a cart page'), asst('Done, tests pass.')], 10 * 60000);
  const s = parseSession(f);
  assert.equal(s.project, 'shop'); assert.equal(s.branch, 'feat/cart'); assert.equal(s.task, 'Add a cart page');
  assert.equal(s.tokensIn, 1500); assert.equal(s.tokensOut, 200); assert.equal(s.status, 'idle');
  assert.ok(Math.abs(s.cost - (1500 * 3 + 200 * 15) / 1e6) < 1e-9);
});

test('a trailing question means waiting, and stops waiting after 2 hours', () => {
  assert.equal(classify('Delete the old route?', 60000).status, 'waiting');
  assert.equal(classify('Delete the old route?', 3 * 3600000).status, 'done');
  assert.equal(classify('All done.', 30000).status, 'working');
  assert.equal(classify('All done.', 10 * 60000).status, 'idle');
  assert.equal(classify('All done.', 3 * 3600000).status, 'done');
});

test('skips sidechain rows, command wrappers and bad JSON lines', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'raqeeb-'));
  const dir = path.join(root, 'p'); fs.mkdirSync(dir);
  const f = path.join(dir, 'x.jsonl');
  fs.writeFileSync(f, [line(user('<command-name>/clear</command-name>')), 'not json', line(user('Real task')), line(asst('sub agent talk', { isSidechain: true })), line(asst('Main answer.'))].join('\n'));
  const s = parseSession(f);
  assert.equal(s.task, 'Real task'); assert.equal(s.lastSay, 'Main answer.');
});

test('scan finds recent sessions, ignores old ones, sorts newest first', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'raqeeb-'));
  writeSession(root, 'a', 'new', [user('A'), asst('ok')], 1000);
  writeSession(root, 'b', 'mid', [user('B'), asst('Shall I continue?')], 5 * 60000);
  writeSession(root, 'c', 'old', [user('C'), asst('ok')], 3 * 24 * 3600000);
  const r = scan(root);
  assert.deepEqual(r.map(x => x.id), ['new', 'mid']); assert.equal(r[1].status, 'waiting'); assert.ok(r[1].question);
  assert.deepEqual(scan(path.join(root, 'missing')), []);
});

test('pricing picks a rate by model name', () => {
  assert.ok(costOf('claude-opus-4', 1e6, 0) > costOf('claude-sonnet-4', 1e6, 0));
  assert.ok(costOf('claude-haiku', 1e6, 0) < costOf('claude-sonnet-4', 1e6, 0));
});

test('parseArgs', () => {
  assert.deepEqual(parseArgs(['--demo', '-p', '5000']).port, 5000);
  assert.equal(parseArgs(['--demo']).demo, true);
});

test('server: serves the page, agents API, health, and blocks path traversal', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'raqeeb-'));
  writeSession(root, 'p', 's', [user('Task'), asst('Working on it.')], 1000);
  const srv = createServer({ dir: root, demo: false }); await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const get = p => new Promise((res, rej) => http.get({ port, path: p, host: '127.0.0.1' }, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res({ code: r.statusCode, body: b })); }).on('error', rej));
  const api = JSON.parse((await get('/api/agents')).body);
  assert.equal(api.demo, false); assert.equal(api.agents.length, 1); assert.equal(api.agents[0].status, 'working');
  assert.equal((await get('/')).code, 200);
  assert.equal(JSON.parse((await get('/api/health')).body).ok, true);
  assert.notEqual((await get('/..%2fpackage.json')).code, 200);
  assert.equal((await get('/../package.json')).code === 200, false);
  srv.close();
  const empty = createServer({ dir: path.join(root, 'nope'), demo: false }); await new Promise(r => empty.listen(0, '127.0.0.1', r));
  const p2 = empty.address().port;
  const body = await new Promise(res => http.get({ port: p2, path: '/api/agents', host: '127.0.0.1' }, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res(JSON.parse(b))); }));
  assert.equal(body.demo, true); assert.equal(body.found, false); empty.close();
});
