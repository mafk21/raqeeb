'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
process.env.RAQEEB_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'raqeeb-lic-'));
const L = require('../lib/license'), base = require('../lib/license-config');
const DAY = 864e5, now = Date.parse('2026-12-01T00:00:00Z');
const polar = { ...base, provider: 'polar', polar: { organizationId: 'org', sandbox: true } };
const gum = { ...base, provider: 'gumroad', gumroad: { productId: 'pid' } };
const reply = (status, body) => async () => ({ status, json: async () => body });
const seq = (...rs) => { const calls = []; const f = async (u, o) => { calls.push([u, o]); return rs[Math.min(calls.length - 1, rs.length - 1)](u, o); }; f.calls = calls; return f; };
const reset = () => fs.rmSync(L.file(), { force: true });

test('not on sale: nothing activates, free features on, Pro features off and marked not built', async () => {
  reset(); const s = L.status(); assert.equal(s.state, 'not_on_sale'); assert.equal(s.onSale, false);
  assert.match((await L.activate('ABCDEFGH-1234')).error, /not on sale/);
  assert.ok(L.hasFeature('handoff', s)); assert.ok(!L.hasFeature('sync', s));
  assert.ok(s.features.filter(f => f.tier === 'pro').every(f => f.built === false && f.enabled === false));
  assert.ok(!fs.existsSync(L.file()));
});
test('decide: active, grace, offline expiry, ended, none', () => {
  const ok = { key: 'k', lastResult: 'ok', lastOkAt: new Date(now - DAY).toISOString() };
  assert.equal(L.decide(ok, now, base).state, 'active');
  assert.equal(L.decide({ ...ok, lastError: 'network' }, now, base).state, 'grace');
  assert.equal(L.decide({ ...ok, lastError: 'network', lastOkAt: new Date(now - 8 * DAY).toISOString() }, now, base).active, false);
  assert.equal(L.decide({ ...ok, endsAt: new Date(now - 1000).toISOString() }, now, base).state, 'ended');
  assert.equal(L.decide({ key: 'k', lastResult: 'ended' }, now, base).active, false);
  assert.equal(L.decide({}, now, base).state, 'none');
});
test('polar adapter: activate then validate; sends the device label and organisation, never anything else', async () => {
  reset(); const f = seq(reply(200, { id: 'act-1' }), reply(200, { status: 'granted', expires_at: '2027-01-01T00:00:00Z' }));
  const s = await L.activate('KEY-ABCDEFGH', { fetchImpl: f, now, c: polar });
  assert.equal(s.active, true); assert.equal(s.endsAt, '2027-01-01T00:00:00Z'); assert.equal(s.key, 'KEY-…FGH'.replace('FGH', 'EFGH'));
  assert.match(f.calls[0][0], /sandbox-api\.polar\.sh\/v1\/customer-portal\/license-keys\/activate$/);
  assert.deepEqual(Object.keys(JSON.parse(f.calls[0][1].body)).sort(), ['key', 'label', 'organization_id']);
  assert.equal(JSON.parse(f.calls[1][1].body).activation_id, 'act-1');
  assert.equal(L.hasFeature('sync', s), false, 'enabled flag requires the feature to be built');
});
test('polar adapter: device limit, bad key, and lapse after activation', async () => {
  reset(); assert.match((await L.activate('KEY-ABCDEFGH', { fetchImpl: seq(reply(403, {})), now, c: polar })).error, /maximum number of devices/);
  assert.ok(!fs.existsSync(L.file()));
  assert.match((await L.activate('KEY-ABCDEFGH', { fetchImpl: seq(reply(404, {})), now, c: polar })).error, /not recognised/);
  reset(); await L.activate('KEY-ABCDEFGH', { fetchImpl: seq(reply(200, { id: 'a' }), reply(200, { status: 'granted', expires_at: null })), now, c: polar });
  const s = await L.refresh({ fetchImpl: seq(reply(404, {})), now: now + DAY, c: polar });
  assert.equal(s.active, false); assert.equal(s.state, 'ended');
});
test('network failure after a good check keeps Pro on only inside the grace window', async () => {
  reset(); await L.activate('KEY-ABCDEFGH', { fetchImpl: seq(reply(200, { id: 'a' }), reply(200, { status: 'granted', expires_at: null })), now, c: polar });
  const down = async () => { throw new Error('offline'); };
  assert.equal((await L.refresh({ fetchImpl: down, now: now + 2 * DAY, c: polar })).state, 'grace');
  assert.equal((await L.refresh({ fetchImpl: down, now: now + 9 * DAY, c: polar })).active, false);
  assert.match((await L.activate('OTHER-KEY-1234', { fetchImpl: down, now, c: polar })).error, /Could not reach/);
});
test('gumroad adapter: counts a use once, treats a failed or cancelled membership as ended', async () => {
  reset(); const ok = reply(200, { success: true, purchase: { subscription_cancelled_at: null, refunded: false } });
  const f = seq(ok, ok); const s = await L.activate('GUM-KEY-12345', { fetchImpl: f, now, c: gum });
  assert.equal(s.active, true); assert.match(f.calls[0][1].body, /increment_uses_count=true/); assert.match(f.calls[0][1].body, /product_id=pid/);
  await L.refresh({ fetchImpl: f, now: now + DAY, c: gum }); assert.match(f.calls[1][1].body, /increment_uses_count=false/);
  const gone = await L.refresh({ fetchImpl: seq(reply(200, { success: true, purchase: { subscription_failed_at: new Date(now).toISOString() } })), now: now + 2 * DAY, c: gum });
  assert.equal(gone.active, false);
  const refunded = await L.refresh({ fetchImpl: seq(reply(200, { success: true, purchase: { refunded: true } })), now: now + 3 * DAY, c: gum });
  assert.equal(refunded.state, 'ended');
});
test('licence file is private and holds no extra data; remove deletes it', async () => {
  reset(); await L.activate('KEY-ABCDEFGH', { fetchImpl: seq(reply(200, { id: 'a' }), reply(200, { status: 'granted', expires_at: null })), now, c: polar });
  assert.equal(fs.statSync(L.file()).mode & 0o077, 0); L.remove(); assert.ok(!fs.existsSync(L.file()));
});
