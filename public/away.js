// "While you were away": a plain list of what changed since the last time this page was open and visible.
// No summarising and no guessing. It only reports each session's current state and last words, for sessions updated since then.
(function (root) {
  const MIN = 15 * 60000;
  function away(agents, lastSeen, now) {
    if (!lastSeen || !(now - lastSeen >= MIN)) return null;
    const ch = (agents || []).filter(a => a.updated > lastSeen).sort((a, b) => b.updated - a.updated);
    const kind = a => a.status === 'waiting' ? 'waiting' : a.status === 'working' ? 'working' : 'finished';
    const items = ch.map(a => ({ id: a.id, tool: a.tool, project: a.project, kind: kind(a), say: a.status === 'waiting' ? (a.question || a.lastSay || '') : (a.lastSay || ''), updated: a.updated }));
    const order = { waiting: 0, finished: 1, working: 2 };
    items.sort((x, y) => order[x.kind] - order[y.kind] || y.updated - x.updated);
    return { since: lastSeen, items, waiting: items.filter(i => i.kind === 'waiting').length, finished: items.filter(i => i.kind === 'finished').length, working: items.filter(i => i.kind === 'working').length };
  }
  if (typeof module !== 'undefined') module.exports = { away, MIN }; else root.Away = { away, MIN };
})(typeof window !== 'undefined' ? window : globalThis);
