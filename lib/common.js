'use strict';
// Shared pieces for every provider adapter.
const fs = require('fs'), path = require('path');

const ACTIVE_MS = 2 * 60 * 1000;       // file written in the last 2 min: working
const IDLE_MS = 30 * 60 * 1000;        // up to 30 min: idle
const WAIT_MS = 2 * 60 * 60 * 1000;    // a question older than 2 h is no longer "waiting"
const MAX_AGE_MS = 24 * 3600 * 1000;   // sessions untouched for 24 h are hidden

function classify(lastSay, ageMs) {
  const asksQuestion = /\?\s*$/.test(String(lastSay || '').trim());
  if (asksQuestion && ageMs < WAIT_MS) return { status: 'waiting', asksQuestion };
  if (ageMs < ACTIVE_MS) return { status: 'working', asksQuestion };
  if (ageMs < IDLE_MS) return { status: 'idle', asksQuestion };
  return { status: 'done', asksQuestion };
}

// Find files under root, at most `depth` folders deep, whose name passes `match`.
function walk(root, depth, match, out = []) {
  let entries; try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(root, e.name);
    if (e.isDirectory()) { if (depth > 0) walk(p, depth - 1, match, out); }
    else if (match(e.name, p)) out.push(p);
  }
  return out;
}

// Look at a folder without reading any session: does it exist, how many session files does it hold?
function inspectFiles(root, depth, match, now = Date.now()) {
  const r = { path: root, exists: false, isDir: false, files: 0, recent: 0 };
  let st; try { st = fs.statSync(root); } catch { return r; }
  r.exists = true; r.isDir = st.isDirectory();
  if (!r.isDir) return r;
  for (const f of walk(root, depth, match)) {
    r.files++;
    try { if (now - fs.statSync(f).mtimeMs <= MAX_AGE_MS) r.recent++; } catch {}
  }
  return r;
}

const readJsonl = file => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

// Parse results are cached by file size and mtime so large logs are not re-read every few seconds.
// Status depends on age, so it is recomputed on every scan.
function makeScanner({ depth, match, parse }) {
  const cache = new Map();
  return function scan(root, now = Date.now()) {
    const out = [];
    for (const p of walk(root, depth, match)) {
      let st; try { st = fs.statSync(p); } catch { continue; }
      if (now - st.mtimeMs > MAX_AGE_MS) continue;
      const key = st.mtimeMs + ':' + st.size, hit = cache.get(p);
      try {
        let s = hit && hit.key === key ? hit.session : parse(p, st);
        if (!hit || hit.key !== key) cache.set(p, { key, session: s });
        if (!s) continue;
        const c = classify(s.lastSay, now - s.updated);
        out.push({ ...s, status: c.status, question: c.asksQuestion && c.status === 'waiting' ? s.lastSay.slice(-300) : '' });
      } catch {}
    }
    return out.sort((a, b) => b.updated - a.updated);
  };
}

module.exports = { ACTIVE_MS, IDLE_MS, WAIT_MS, MAX_AGE_MS, classify, walk, inspectFiles, readJsonl, makeScanner };
