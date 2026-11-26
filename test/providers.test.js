'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const h = require('./helpers');
const { classify } = require('../lib/common');
const { costOf, rateFor } = require('../lib/pricing');
const claude = require('../lib/providers/claude'), codex = require('../lib/providers/codex'), cursor = require('../lib/providers/cursor');
const { providers } = require('../lib/sessions');

test('classify: question means waiting for 2 hours, then done', () => {
  assert.equal(classify('Delete the old route?', 60000).status, 'waiting');
  assert.equal(classify('Delete the old route?', 3 * 3600000).status, 'done');
  assert.equal(classify('All done.', 30000).status, 'working');
  assert.equal(classify('All done.', 10 * 60000).status, 'idle');
  assert.equal(classify('All done.', 3 * 3600000).status, 'done');
});

test('pricing: Claude has rates, other tools return null (never invented)', () => {
  assert.ok(costOf('claude-opus-4', 1e6, 0) > costOf('claude-sonnet-4', 1e6, 0));
  assert.ok(costOf('claude-haiku', 1e6, 0) < costOf('claude-sonnet-4', 1e6, 0));
  assert.equal(costOf('gpt-5', 1e6, 1e6), null); assert.equal(costOf('', 5, 5), null); assert.equal(rateFor('unknown'), null);
});

test('every adapter has the documented shape', () => {
  for (const p of providers) {
    for (const k of ['id', 'name', 'start', 'note']) assert.equal(typeof p[k], 'string', p.id + '.' + k);
    for (const k of ['defaultRoot', 'candidates', 'parse', 'inspect', 'scan']) assert.equal(typeof p[k], 'function', p.id + '.' + k);
    assert.equal(typeof p.experimental, 'boolean');
  }
  assert.deepEqual(providers.filter(p => p.experimental).map(p => p.id).sort(), ['codex', 'cursor']);
});

test('claude: task, branch, project, tokens, cost; skips sidechains, wrappers, bad lines', () => {
  const root = h.tmp();
  const f = h.claude(root, 'p', 's1', [h.cUser('<command-name>/clear</command-name>'), 'not json', h.cUser('Add a cart page'), h.cAsst('side', { isSidechain: true }), h.cAsst('Done, tests pass.')], 10 * 60000);
  const s = claude.parse(f);
  assert.equal(s.project, 'shop'); assert.equal(s.branch, 'feat/cart'); assert.equal(s.task, 'Add a cart page'); assert.equal(s.lastSay, 'Done, tests pass.');
  assert.equal(s.tokensIn, 1500); assert.equal(s.tokensOut, 200);
  assert.ok(Math.abs(s.cost - (1500 * 3 + 200 * 15) / 1e6) < 1e-9);
});

test('claude: scan finds recent, ignores old, newest first, missing folder is empty', () => {
  const root = h.tmp();
  h.claude(root, 'a', 'new', [h.cUser('A'), h.cAsst('ok')], 1000);
  h.claude(root, 'b', 'mid', [h.cUser('B'), h.cAsst('Shall I continue?')], 5 * 60000);
  h.claude(root, 'c', 'old', [h.cUser('C'), h.cAsst('ok')], 3 * 24 * 3600000);
  const r = claude.scan(root);
  assert.deepEqual(r.map(x => x.id), ['new', 'mid']); assert.equal(r[1].status, 'waiting'); assert.ok(r[1].question);
  assert.deepEqual(claude.scan(path.join(root, 'missing')), []);
});

test('codex: parses a rollout file; cached tokens are not billed twice; no cost', () => {
  const root = h.tmp();
  const f = h.codex(root, 'abc-123', h.codexRows('Add retries to the queue', 'Should I also add a dead-letter queue?'), 2 * 60000);
  const s = codex.parse(f);
  assert.equal(s.id, 'abc-123'); assert.equal(s.project, 'api'); assert.equal(s.branch, 'main'); assert.equal(s.model, 'gpt-5');
  assert.equal(s.task, 'Add retries to the queue'); assert.equal(s.tokensIn, 5000); assert.equal(s.tokensOut, 300); assert.equal(s.hasUsage, true); assert.equal(s.cost, null);
  const r = codex.scan(root); assert.equal(r.length, 1); assert.equal(r[0].status, 'waiting');
});

test('codex: sub-agent rollouts are skipped', () => {
  const root = h.tmp();
  h.codex(root, 'sub-1', h.codexRows('x', 'y', { source: { subagent: 'review' } }), 1000);
  h.codex(root, 'main-1', h.codexRows('x', 'y'), 1000);
  assert.equal(codex.scan(root).length, 1);
});

test('cursor: reads agent-transcripts, strips <user_query>, no tokens, no cost', () => {
  const root = h.tmp();
  h.cursor(root, 'home-dev-docs-site', 'chat1', h.cursorRows('Fix the search index', 'Done, the index builds in 2s.'), 60000);
  const r = cursor.scan(root);
  assert.equal(r.length, 1); assert.equal(r[0].task, 'Fix the search index'); assert.equal(r[0].project, 'site');
  assert.equal(r[0].hasUsage, false); assert.equal(r[0].cost, null); assert.equal(r[0].tokensIn, 0);
});

test('cursor: tolerant of plain-string content', () => {
  const root = h.tmp();
  h.cursor(root, 'p-app', 'c2', [{ role: 'user', content: 'Plain task' }, { role: 'assistant', content: 'Plain reply' }], 1000);
  const r = cursor.scan(root); assert.equal(r[0].task, 'Plain task'); assert.equal(r[0].lastSay, 'Plain reply');
});

test('inspect reports exists / files / recent per provider', () => {
  const root = h.tmp();
  h.codex(root, 'old', h.codexRows('x', 'y'), 3 * 24 * 3600000);
  const i = codex.inspect(root, Date.now());
  assert.equal(i.exists, true); assert.equal(i.files, 1); assert.equal(i.recent, 0);
  assert.equal(codex.inspect(path.join(root, 'nope'), Date.now()).exists, false);
});
