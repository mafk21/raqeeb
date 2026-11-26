'use strict';
const test = require('node:test'), assert = require('node:assert');
const { away } = require('../public/away.js');
const now = Date.parse('2026-12-01T12:00:00Z'), H = 36e5;
const A = (id, status, ago, extra = {}) => ({ id, tool: 'Claude Code', project: 'p' + id, status, updated: now - ago, lastSay: 'said ' + id, ...extra });
test('away: nothing before 15 minutes or with no earlier visit', () => {
  assert.equal(away([A(1, 'done', 1000)], 0, now), null);
  assert.equal(away([A(1, 'done', 1000)], now - 10 * 60000, now), null);
});
test('away: only sessions updated since the last visit, waiting first, no invention', () => {
  const d = away([A(1, 'done', 3 * H), A(2, 'working', 10 * 60000), A(3, 'waiting', 20 * 60000, { question: 'Delete route?' }), A(4, 'idle', 30 * 60000)], now - 2 * H, now);
  assert.deepEqual(d.items.map(i => i.id), ['3', '4', '2']);
  assert.deepEqual([d.waiting, d.finished, d.working], [1, 1, 1]);
  assert.equal(d.items[0].say, 'Delete route?'); assert.equal(d.items[1].say, 'said 4');
  assert.deepEqual(Object.keys(d.items[0]).sort(), ['id', 'kind', 'project', 'say', 'tool', 'updated']);
});
test('away: no changed sessions gives an empty list, not a made-up summary', () => {
  assert.equal(away([A(1, 'done', 5 * H)], now - 2 * H, now).items.length, 0);
});
