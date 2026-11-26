'use strict';
// Provider-agnostic licence layer. A provider adapter turns "key -> answer" into one normalized shape:
//   { ok: true, endsAt: ISO|null, instanceId?: string } | { ok: false, reason: 'invalid'|'ended'|'device_limit' } | throws on network trouble
// The decision (active, grace, lapsed) is made in decide(), which is pure and tested without any network.
// Honest limit: this runs on the user's machine, so it is a convenience check, not copy protection.
const fs = require('fs'), path = require('path'), os = require('os');
const cfg = require('./license-config');

const FEATURES = {
  // id: [tier, built?]. Only features that exist may be marked built. Nothing Pro is built yet.
  dashboard: ['free', true], answering: ['free', true], handoff: ['free', true], conflicts: ['free', true], mcp: ['free', true],
  phone_approvals: ['pro', false], sync: ['pro', false], summaries: ['pro', false], auto_rules: ['pro', false], budgets: ['pro', false], long_history: ['pro', false]
};
const file = () => path.join(process.env.RAQEEB_HOME || path.join(os.homedir(), '.raqeeb'), 'license.json');
const load = () => { try { const j = JSON.parse(fs.readFileSync(file(), 'utf8')); return j && typeof j === 'object' ? j : {}; } catch { return {}; } };
const save = s => { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file(), JSON.stringify(s, null, 2), { mode: 0o600 }); };
const mask = k => k ? k.slice(0, 4) + '…' + k.slice(-4) : '';

async function post(f, url, body, form) {
  const r = await f(url, { method: 'POST', headers: { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json', Accept: 'application/json' }, body: form ? new URLSearchParams(body).toString() : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
}
const adapters = {
  polar: {
    ready: c => !!c.polar.organizationId,
    async check(key, st, c, f) {
      const base = c.polar.sandbox ? 'https://sandbox-api.polar.sh' : 'https://api.polar.sh';
      let id = st.instanceId;
      if (!id) {
        const a = await post(f, base + '/v1/customer-portal/license-keys/activate', { key, organization_id: c.polar.organizationId, label: c.deviceLabelPrefix + '-' + os.hostname().slice(0, 30) });
        if (a.status === 403) return { ok: false, reason: 'device_limit' };
        if (a.status === 404) return { ok: false, reason: 'invalid' };
        if (a.status !== 200 && a.status !== 201) throw new Error('provider ' + a.status);
        id = a.body && a.body.id;
      }
      const v = await post(f, base + '/v1/customer-portal/license-keys/validate', { key, organization_id: c.polar.organizationId, ...(id ? { activation_id: id } : {}) });
      if (v.status === 404) return { ok: false, reason: st.instanceId ? 'ended' : 'invalid' };
      if (v.status !== 200 || !v.body || v.body.status !== 'granted') throw new Error('provider ' + v.status);
      return { ok: true, endsAt: v.body.expires_at || null, instanceId: id };
    }
  },
  gumroad: {
    ready: c => !!c.gumroad.productId,
    // Gumroad has no device activation. A "use" is counted on first activation only; the device limit is enforced by us via that count.
    async check(key, st, c, f) {
      const first = !st.activatedAt;
      const v = await post(f, 'https://api.gumroad.com/v2/licenses/verify', { product_id: c.gumroad.productId, license_key: key, increment_uses_count: first ? 'true' : 'false' }, true);
      if (v.status === 404) return { ok: false, reason: 'invalid' };
      if (v.status !== 200 || !v.body || !v.body.success) throw new Error('provider ' + v.status);
      const p = v.body.purchase || {};
      if (p.refunded || p.chargebacked || p.disputed) return { ok: false, reason: 'ended' };
      if (p.subscription_ended_at || p.subscription_cancelled_at || p.subscription_failed_at) {
        const end = p.subscription_ended_at || p.subscription_cancelled_at || p.subscription_failed_at;
        if (Date.parse(end) <= Date.now()) return { ok: false, reason: 'ended' };
        return { ok: true, endsAt: end };
      }
      return { ok: true, endsAt: null };
    }
  }
};

// Pure. st = saved state, now = ms. A key that was valid keeps working through a network failure for offlineGraceDays.
function decide(st, now, c = cfg) {
  if (!st || !st.key) return { active: false, state: 'none' };
  if (st.lastResult === 'ok') {
    if (st.endsAt && Date.parse(st.endsAt) + 0 < now) return { active: false, state: 'ended' };
    const age = now - Date.parse(st.lastOkAt || 0);
    if (st.lastError && age > c.offlineGraceDays * 864e5) return { active: false, state: 'offline_expired' };
    return { active: true, state: st.lastError ? 'grace' : 'active' };
  }
  return { active: false, state: st.lastResult || 'none' };
}

async function refresh({ fetchImpl = globalThis.fetch, now = Date.now(), c = cfg } = {}) {
  const st = load(); if (!st.key) return status({ now, c });
  const ad = adapters[c.provider]; if (!ad || !ad.ready(c)) return status({ now, c });
  try {
    const r = await ad.check(st.key, st, c, fetchImpl);
    if (r.ok) { Object.assign(st, { lastResult: 'ok', lastOkAt: new Date(now).toISOString(), endsAt: r.endsAt, instanceId: r.instanceId || st.instanceId, activatedAt: st.activatedAt || new Date(now).toISOString() }); delete st.lastError; }
    else { st.lastResult = r.reason; delete st.lastError; }
  } catch (e) { st.lastError = 'network'; }
  st.checkedAt = new Date(now).toISOString(); save(st);
  return status({ now, c });
}
async function activate(key, opts = {}) {
  const c = opts.c || cfg;
  if (!c.provider || !adapters[c.provider] || !adapters[c.provider].ready(c)) return { error: 'Raqeeb Pro is not on sale yet, so there is nothing to activate.' };
  key = String(key || '').trim(); if (key.length < 8 || key.length > 200 || /\s/.test(key)) return { error: 'That does not look like a licence key.' };
  save({ key });
  const s = await refresh(opts);
  if (!s.active) {
    const reason = load().lastResult, net = load().lastError; fs.rmSync(file(), { force: true });
    return { error: net ? 'Could not reach the licence server. Check your connection and try again.' : reason === 'device_limit' ? 'This key is already used on the maximum number of devices.' : reason === 'ended' ? 'This subscription has ended.' : 'That key was not recognised.' };
  }
  return s;
}
function remove() { fs.rmSync(file(), { force: true }); return status(); }
function status({ now = Date.now(), c = cfg } = {}) {
  const st = load(), d = decide(st, now, c), onSale = !!(c.provider && adapters[c.provider] && adapters[c.provider].ready(c));
  return { onSale, active: d.active, state: onSale || st.key ? d.state : 'not_on_sale', key: mask(st.key), endsAt: st.endsAt || null, checkedAt: st.checkedAt || null,
    features: Object.entries(FEATURES).map(([id, [tier, built]]) => ({ id, tier, built, enabled: tier === 'free' ? built : built && d.active })) };
}
const hasFeature = (id, s = status()) => { const f = s.features.find(x => x.id === id); return !!(f && f.enabled); };
module.exports = { FEATURES, decide, status, activate, refresh, remove, hasFeature, adapters, file };
