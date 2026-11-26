'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const h = require('./helpers');
const { classify } = require('../lib/common');
const { costOf, rateFor } = require('../lib/pricing');
const claude = require('../lib/providers/claude'), codex = require('../lib/providers/codex'), cursor = require('../lib/providers/cursor'), gemini = require('../lib/providers/gemini'), aider = require('../lib/providers/aider'), cline = require('../lib/providers/cline');
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
  assert.deepEqual(providers.filter(p => p.experimental).map(p => p.id).sort(), ['aider', 'cline', 'codex', 'cursor', 'gemini']);
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

test('gemini: reads a JSONL session, text parts, tokens incl. thoughts, project from .project_root; no cost', () => {
  const root = h.tmp();
  h.gemini(root, 'abc123', 's1', h.geminiRows('Add a retry wrapper', 'Done. Should I also add tests?'), 3 * 60000);
  fs.writeFileSync(path.join(root, 'abc123', '.project_root'), '/home/dev/pipeline');
  const r = gemini.scan(root);
  assert.equal(r.length, 1); assert.equal(r[0].id, 'sess-1'); assert.equal(r[0].project, 'pipeline'); assert.equal(r[0].task, 'Add a retry wrapper');
  assert.equal(r[0].tokensIn, 1200); assert.equal(r[0].tokensOut, 350); assert.equal(r[0].cost, null); assert.equal(r[0].status, 'waiting'); assert.equal(r[0].model, 'gemini-2.5-pro');
});

test('gemini: reads the older whole-session JSON, skips sub-agent sessions', () => {
  const root = h.tmp();
  h.put(path.join(root, 'p1', 'chats', 'session-a.json'), [JSON.stringify({ sessionId: 'a', messages: [{ type: 'user', content: 'Hello task' }, { type: 'gemini', content: 'Reply.' }] })], 1000);
  h.put(path.join(root, 'p1', 'chats', 'session-b.json'), [JSON.stringify({ sessionId: 'b', kind: 'subagent', messages: [] })], 1000);
  h.put(path.join(root, 'p1', 'chats', 'notes.json'), ['{}'], 1000);
  const r = gemini.scan(root); assert.equal(r.length, 1); assert.equal(r[0].task, 'Hello task'); assert.equal(r[0].lastSay, 'Reply.');
});

test('aider: uses the latest run only; tokens with k suffix; prompt and reply; skips node_modules', () => {
  const root = h.tmp();
  h.aider(root, 'cli-tools', h.aiderText('Add a --json flag', 'Added the flag. Want a test too?'), 60000);
  h.aider(root, 'node_modules/dep', h.aiderText('x', 'y'), 1000);
  const r = aider.scan(root);
  assert.equal(r.length, 1); assert.equal(r[0].project, 'cli-tools'); assert.equal(r[0].task, 'Add a --json flag');
  assert.equal(r[0].lastSay, 'Added the flag. Want a test too?'); assert.equal(r[0].model, 'gpt-4o');
  assert.equal(r[0].tokensIn, 1500); assert.equal(r[0].tokensOut, 320); assert.equal(r[0].cost, null); assert.equal(r[0].status, 'waiting');
});

test('aider: history with no token line has no usage; no history means none found', () => {
  const root = h.tmp();
  h.aider(root, 'r', '# aider chat started at 2026-11-26 10:00:00\n\n#### do it\n\nOk.\n', 1000);
  const r = aider.scan(root); assert.equal(r[0].hasUsage, false); assert.equal(r[0].task, 'do it');
  assert.deepEqual(aider.scan(h.tmp()), []);
});

test('cline: task, tokens from api_req_started, followup question means waiting', () => {
  const root = h.tmp();
  h.cline(root, '1732600000000', h.clineRows('Make the pricing table responsive', [{ ts: 4, type: 'ask', ask: 'followup', text: JSON.stringify({ question: 'Use CSS grid or flexbox?' }) }]), 60000);
  const r = cline.scan(root);
  assert.equal(r.length, 1); assert.equal(r[0].task, 'Make the pricing table responsive'); assert.equal(r[0].tokensIn, 4000); assert.equal(r[0].tokensOut, 500);
  assert.equal(r[0].model, 'claude-sonnet-4'); assert.equal(r[0].cost, null); assert.equal(r[0].status, 'waiting'); assert.equal(r[0].question, 'Use CSS grid or flexbox?');
});

test('cline: a finished task is not waiting; bad JSON is skipped', () => {
  const root = h.tmp();
  h.cline(root, 't1', h.clineRows('Fix bug', [{ ts: 4, type: 'say', say: 'completion_result', text: 'Fixed.' }, { ts: 5, type: 'ask', ask: 'completion_result', text: '' }]), 3 * 3600000 / 6);
  h.put(path.join(root, 't2', 'ui_messages.json'), ['{not json'], 1000);
  const r = cline.scan(root); assert.equal(r.length, 1); assert.equal(r[0].lastSay, 'Fixed.'); assert.notEqual(r[0].status, 'waiting');
});
