'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const line = o => JSON.stringify(o);
const tmp = p => fs.mkdtempSync(path.join(os.tmpdir(), p || 'raqeeb-'));
function put(file, rows, ageMs = 0) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, rows.map(r => typeof r === 'string' ? r : line(r)).join('\n') + '\n');
  const t = new Date(Date.now() - ageMs); fs.utimesSync(file, t, t); return file;
}
// Fixtures follow the published format notes for each tool (see lib/providers/*.js). They are not captures from real installs.
const claude = (root, proj, name, rows, age) => put(path.join(root, proj, name + '.jsonl'), rows, age);
const cUser = t => ({ type: 'user', cwd: '/home/dev/shop', gitBranch: 'feat/cart', message: { role: 'user', content: t } });
const cAsst = (t, x = {}) => ({ type: 'assistant', cwd: '/home/dev/shop', message: { role: 'assistant', model: 'claude-sonnet-4', content: [{ type: 'text', text: t }], usage: { input_tokens: 1000, cache_creation_input_tokens: 500, output_tokens: 200 } }, ...x });
const codex = (root, name, rows, age) => put(path.join(root, '2026', '11', '26', 'rollout-2026-11-26T10-00-00-' + name + '.jsonl'), rows, age);
const codexRows = (task, say, extra = {}) => [
  { timestamp: 't', type: 'session_meta', payload: { id: 'abc-123', cwd: '/home/dev/api', git: { branch: 'main' }, ...extra } },
  { timestamp: 't', type: 'turn_context', payload: { model: 'gpt-5' } },
  { timestamp: 't', type: 'event_msg', payload: { type: 'user_message', message: task } },
  { timestamp: 't', type: 'event_msg', payload: { type: 'agent_message', message: say } },
  { timestamp: 't', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 5000, cached_input_tokens: 1000, output_tokens: 300 } } } }];
const cursor = (root, slug, id, rows, age) => put(path.join(root, slug, 'agent-transcripts', id, id + '.jsonl'), rows, age);
const cursorRows = (task, say) => [
  { role: 'user', message: { content: [{ type: 'text', text: '<user_query>\n' + task + '\n</user_query>' }] } },
  { role: 'assistant', message: { content: [{ type: 'text', text: say }] } }];
function req(port, p, opt = {}) {
  return new Promise((res, rej) => { const r = http.request({ port, path: p, host: '127.0.0.1', agent: false, ...opt }, x => { let b = ''; x.on('data', d => b += d); x.on('end', () => res({ code: x.statusCode, body: b })); }); r.on('error', rej); if (opt.data) r.write(opt.data); r.end(); });
}
module.exports = { tmp, put, claude, cUser, cAsst, codex, codexRows, cursor, cursorRows, req };
