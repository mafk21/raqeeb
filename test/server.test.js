'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const h = require('./helpers');
const { createServer, parseArgs } = require('../server');
const listen = async o => { const s = createServer(o); await new Promise(r => s.listen(0, '127.0.0.1', r)); return [s, s.address().port]; };
const J = async (port, p, o) => JSON.parse((await h.req(port, p, o)).body);

test('parseArgs: per-provider folders, --dir is the Claude alias', () => {
  const o = parseArgs(['--demo', '-p', '5000', '--dir', '/a', '--codex-dir', '/b', '--cursor-dir', '/c']);
  assert.equal(o.port, 5000); assert.equal(o.demo, true); assert.deepEqual(o.dirs, { claude: '/a', codex: '/b', cursor: '/c' });
  assert.equal(parseArgs(['--claude-dir', '/z']).dirs.claude, '/z');
});

test('API: mixed providers, tagged and sorted; static + health; traversal blocked', async () => {
  process.env.RAQEEB_HOME = h.tmp('raqeeb-home-');
  const c = h.tmp(), x = h.tmp(), u = h.tmp();
  h.claude(c, 'p', 's', [h.cUser('Task'), h.cAsst('Working.')], 5000);
  h.codex(x, 'cx1', h.codexRows('Codex task', 'Working on it.'), 1000);
  h.cursor(u, 'a-b-web', 'cu1', h.cursorRows('Cursor task', 'Ok.'), 9000);
  const [srv, port] = await listen({ dirs: { claude: c, codex: x, cursor: u }, demo: false });
  const api = await J(port, '/api/agents');
  assert.equal(api.state, 'ok'); assert.equal(api.demo, false);
  assert.deepEqual(api.agents.map(a => a.provider), ['codex', 'claude', 'cursor']);
  assert.deepEqual(api.agents.map(a => a.id), ['codex:abc-123', 'claude:s', 'cursor:cu1']);
  assert.deepEqual(api.providers.map(p => [p.id, p.state, p.count]), [['claude', 'ok', 1], ['codex', 'ok', 1], ['cursor', 'ok', 1]]);
  assert.equal(api.agents[0].cost, null); assert.ok(api.agents[1].cost > 0);
  assert.equal((await h.req(port, '/')).code, 200);
  assert.equal(JSON.parse((await h.req(port, '/api/health')).body).ok, true);
  assert.notEqual((await h.req(port, '/..%2fpackage.json')).code, 200);
  srv.closeAllConnections(); srv.close();
});

test('no placeholder data: each provider reports its own empty state', async () => {
  process.env.RAQEEB_HOME = h.tmp('raqeeb-home-');
  const base = h.tmp(), codexOld = h.tmp();
  h.codex(codexOld, 'old', h.codexRows('x', 'y'), 3 * 24 * 3600000);
  const [srv, port] = await listen({ dirs: { claude: path.join(base, 'none'), codex: codexOld, cursor: path.join(base, 'none2') }, demo: false });
  const b = await J(port, '/api/agents');
  assert.equal(b.state, 'empty'); assert.deepEqual(b.agents, []); assert.equal(b.demo, false);
  assert.deepEqual(b.providers.map(p => p.state), ['no-folder', 'no-sessions', 'no-folder']);
  assert.equal(b.providers[1].info.files, 1);
  const d = await J(port, '/api/agents?demo=1');
  assert.equal(d.demo, true); assert.deepEqual([...new Set(d.agents.map(a => a.provider))].sort(), ['claude', 'codex', 'cursor']);
  assert.ok(d.agents.every(a => a.demo));
  srv.closeAllConnections(); srv.close();
});

test('one provider with sessions makes the overall state ok', async () => {
  process.env.RAQEEB_HOME = h.tmp('raqeeb-home-');
  const u = h.tmp(); h.cursor(u, 'p-x', 'c', h.cursorRows('T', 'R'), 1000);
  const [srv, port] = await listen({ dirs: { claude: '/nonexistent-a', codex: '/nonexistent-b', cursor: u }, demo: false });
  const b = await J(port, '/api/agents'); assert.equal(b.state, 'ok'); assert.equal(b.agents.length, 1); srv.closeAllConnections(); srv.close();
});

test('setup API: per provider save, validation, same-origin, localhost-only, locked', async () => {
  const home = process.env.RAQEEB_HOME = h.tmp('raqeeb-home-');
  const root = h.tmp(); h.codex(root, 'z', h.codexRows('T', 'R'), 1000);
  const [srv, port] = await listen({ demo: false });
  const post = (data, hd = {}) => h.req(port, '/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json', ...hd }, data: JSON.stringify(data) });
  const setup = await J(port, '/api/setup');
  assert.deepEqual(setup.providers.map(p => p.id), ['claude', 'codex', 'cursor']); assert.ok(Array.isArray(setup.providers[0].candidates));
  assert.equal((await post({ provider: 'codex', dir: '/definitely/not/here' })).code, 400);
  assert.equal((await post({ provider: 'codex', dir: 'relative' })).code, 400);
  assert.equal((await post({ provider: 'nope', dir: root })).code, 400);
  assert.equal((await post({ provider: 'codex', dir: root }, { Origin: 'http://evil.example' })).code, 403);
  assert.equal((await h.req(port, '/api/setup', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, data: '{}' })).code, 415);
  assert.equal((await h.req(port, '/api/agents', { headers: { Host: 'evil.example' } })).code, 403);
  assert.equal((await post({ provider: 'codex', dir: root }, { Origin: 'http://localhost:' + port })).code, 200);
  const a = await J(port, '/api/agents'); assert.equal(a.agents.length, 1); assert.equal(a.agents[0].provider, 'codex');
  assert.equal(JSON.parse(fs.readFileSync(path.join(home, 'config.json'), 'utf8')).dirs.codex, root);
  assert.equal((await post({ provider: 'codex', dir: '' })).code, 200); // back to default
  srv.closeAllConnections(); srv.close();
  const [lk, lp] = await listen({ dirs: { codex: root }, demo: false });
  assert.equal((await h.req(lp, '/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, data: JSON.stringify({ provider: 'codex', dir: root }) })).code, 409);
  lk.closeAllConnections(); lk.close();
});
