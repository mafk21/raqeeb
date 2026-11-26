'use strict';
// Warns when two agent sessions are active in the same repository checkout. Local only, reads nothing but git's repo root.
const cp = require('child_process'), path = require('path');
const ACTIVE_MS = 30 * 60000, CACHE_MS = 60000;
const cache = new Map();
function rootOf(cwd, now) {
  const c = cache.get(cwd); if (c && now - c.at < CACHE_MS) return c.root;
  let root = '';
  try { root = cp.execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
  if (!root) root = cwd;
  cache.set(cwd, { at: now, root }); if (cache.size > 200) cache.clear();
  return root;
}
// Returns agents with a `conflict` list: the other active sessions in the same repo checkout. Git worktrees have separate roots, so they are not flagged.
function annotate(agents, now = Date.now()) {
  const groups = new Map();
  for (const a of agents) {
    a.conflict = [];
    if (!a.cwd || !path.isAbsolute(a.cwd) || a.status === 'done' || now - a.updated > ACTIVE_MS) continue;
    const r = rootOf(a.cwd, now); a._root = r; (groups.get(r) || groups.set(r, []).get(r)).push(a);
  }
  for (const g of groups.values()) if (g.length > 1) for (const a of g) a.conflict = g.filter(b => b !== a).map(b => ({ id: b.id, tool: b.tool, status: b.status }));
  for (const a of agents) delete a._root;
  return agents;
}
module.exports = { annotate, ACTIVE_MS };
