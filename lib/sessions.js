'use strict';
// Combines every provider into one list of agent cards.
const { list, byId } = require('./providers');
const { classify } = require('./common');

// Folder for one provider: command-line flag, then the folder saved in setup, then the default.
function rootFor(id, opts = {}, cfg = {}) {
  const p = byId[id];
  return (opts.dirs && opts.dirs[id]) || (cfg.dirs && cfg.dirs[id]) || (id === 'claude' && cfg.dir) || p.defaultRoot();
}

function stateOf(info) { return !info.exists || !info.isDir ? 'no-folder' : info.recent === 0 ? 'no-sessions' : 'ok'; }

function collect(opts = {}, cfg = {}, now = Date.now()) {
  const agents = [], providers = [];
  for (const p of list) {
    const root = rootFor(p.id, opts, cfg), info = p.inspect(root, now), state = stateOf(info);
    let cards = [];
    if (state === 'ok') cards = p.scan(root, now).map(s => ({ ...s, id: p.id + ':' + s.id, provider: p.id, tool: p.name }));
    agents.push(...cards);
    providers.push({ id: p.id, name: p.name, experimental: p.experimental, start: p.start, note: p.note, root, locked: !!(opts.dirs && opts.dirs[p.id]), info, state, count: cards.length });
  }
  agents.sort((a, b) => b.updated - a.updated);
  return { agents, providers, state: agents.length ? 'ok' : 'empty' };
}

function demo(now = Date.now()) {
  const m = 60000;
  const mk = (i, provider, project, branch, task, say, status, ago, ti, to, cost, model) => ({
    id: 'demo' + i, provider, tool: byId[provider].name, project, cwd: '~/code/' + project, branch, model, task, lastSay: say,
    question: status === 'waiting' ? say : '', status, updated: now - ago * m, tokensIn: ti, tokensOut: to, turns: 6 + i,
    cost, hasUsage: ti + to > 0, demo: true
  });
  return [
    mk(1, 'claude', 'checkout-api', 'fix/stripe-webhooks', 'Make the webhook handler idempotent and add retries', 'Should I delete the legacy /v1/hooks route, or keep it behind a flag?', 'waiting', 3, 182000, 21000, 0.86, 'claude-sonnet'),
    mk(2, 'codex', 'mobile-app', 'feat/offline-sync', 'Add offline queue for form submissions', 'Writing the sync queue now, touching storage.ts and queue.ts.', 'working', 0.4, 240000, 36000, null, 'gpt-5'),
    mk(3, 'cursor', 'docs-site', '', 'Replace the search index with a static one', 'Index builds in 2s. Waiting on nothing.', 'idle', 12, 0, 0, null, ''),
    mk(4, 'claude', 'billing-service', 'refactor/invoices', 'Split invoice rendering into its own module', 'Done. 31 files changed, all tests green.', 'done', 95, 420000, 58000, 2.13, 'claude-opus'),
    mk(5, 'codex', 'infra', 'main', 'Upgrade Node to 22 in all Dockerfiles', 'I found 3 services pinned to Node 18. Upgrade them too?', 'waiting', 7, 51000, 6000, null, 'gpt-5')
  ];
}
const demoProviders = () => list.map(p => ({ id: p.id, name: p.name, experimental: p.experimental, state: 'demo', count: demo().filter(a => a.provider === p.id).length }));

module.exports = { collect, demo, demoProviders, rootFor, stateOf, classify, providers: list, byId };
