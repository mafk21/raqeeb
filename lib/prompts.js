'use strict';
// Pending questions and approvals that an agent's hook is waiting on.
// Held in memory only. Nothing here is written to disk, and an answer only ever goes back to the hook that asked.
const crypto = require('crypto'), path = require('path');
const pending = new Map();
let viewerSeen = 0;
const VIEWER_MS = 15000;

const clip = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '...' : s; };
function summarize(tool, p) {
  const name = String(p.tool_name || ''), ti = p.tool_input && typeof p.tool_input === 'object' ? p.tool_input : {};
  if (name === 'AskUserQuestion' && Array.isArray(ti.questions)) {
    const qs = ti.questions.slice(0, 4).map(q => ({
      question: clip(q.question, 400), header: clip(q.header, 40), multiSelect: !!q.multiSelect,
      options: (Array.isArray(q.options) ? q.options : []).slice(0, 8).map(o => ({ label: clip(o.label, 120), description: clip(o.description, 300) }))
    })).filter(q => q.question && q.options.length);
    if (qs.length && tool === 'claude') return { kind: 'question', title: 'Asks you a question', questions: qs };
  }
  let detail;
  if (typeof ti.command === 'string') detail = ti.command;
  else if (typeof ti.file_path === 'string') detail = ti.file_path;
  else if (typeof ti.plan === 'string') detail = ti.plan;
  else { try { detail = JSON.stringify(ti); } catch { detail = ''; } }
  const title = name === 'ExitPlanMode' ? 'Wants your approval of its plan' : 'Asks permission to use ' + (name || 'a tool');
  return { kind: 'permission', title, toolName: clip(name, 80), detail: clip(detail, 1500), reason: clip(ti.description, 300) };
}

function create(tool, payload, res) {
  const id = crypto.randomBytes(12).toString('hex');
  const s = summarize(tool, payload || {});
  const item = { id, tool, sessionId: String((payload || {}).session_id || ''), cwd: String((payload || {}).cwd || ''), created: Date.now(), ...s, raw: s.kind === 'question' ? payload.tool_input : null, done: null };
  pending.set(id, item);
  return item;
}
const list = () => [...pending.values()].map(({ raw, done, ...rest }) => rest).sort((a, b) => a.created - b.created);
const get = id => pending.get(id);
function touchViewer() { viewerSeen = Date.now(); }
const viewerActive = () => Date.now() - viewerSeen < VIEWER_MS;
function remove(id) { pending.delete(id); }

// Validate a dashboard answer and turn it into the decision the hook returns. Returns null for anything malformed.
function decide(item, a) {
  if (!a || typeof a !== 'object') return null;
  if (a.action === 'terminal') return { none: true };
  if (item.kind === 'permission') {
    if (a.action === 'allow') return { behavior: 'allow' };
    if (a.action === 'deny') return { behavior: 'deny', message: 'Denied from the Raqeeb dashboard.' };
    return null;
  }
  if (item.kind === 'question' && a.action === 'answer' && a.answers && typeof a.answers === 'object') {
    const answers = {};
    for (const q of item.questions) {
      const v = a.answers[q.question];
      const picks = (Array.isArray(v) ? v : [v]).map(String);
      const labels = q.options.map(o => o.label);
      if (!picks.length || !picks.every(x => labels.includes(x)) || (!q.multiSelect && picks.length !== 1)) return null;
      answers[q.question] = picks.join(', ');
    }
    // Use the original, untruncated question text as the key when we clipped it.
    const orig = (item.raw && item.raw.questions) || [], out = {};
    item.questions.forEach((q, i) => { out[orig[i] && String(orig[i].question) || q.question] = answers[q.question]; });
    return { behavior: 'allow', updatedInput: { ...item.raw, answers: out } };
  }
  return null;
}
module.exports = { create, list, get, remove, decide, touchViewer, viewerActive, summarize };
