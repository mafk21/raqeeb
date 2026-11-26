'use strict';
// Cline (VS Code extension saoudrizwan.claude-dev). One folder per task:
//   <editor>/User/globalStorage/saoudrizwan.claude-dev/tasks/<task-id>/ui_messages.json   (plus api_conversation_history.json)
// <editor> is ~/.config/Code (Linux), ~/Library/Application Support/Code (macOS) or %APPDATA%\Code (Windows); Cursor, Insiders and
// VSCodium have their own equivalents. ui_messages.json is a JSON array of {ts, type: "ask"|"say", ask?, say?, text?, modelInfo?}.
// say "task" holds the task text; say "api_req_started" has a JSON text with tokensIn / tokensOut; ask "followup" asks you a question
// (text is JSON with "question"); ask "completion_result" and "command"/"tool" are approval or finish prompts.
// Sources:
//   https://github.com/cline/cline/blob/8a6441fd/src/shared/ExtensionMessage.ts  (ClineMessage, ClineAsk, ClineSay)
//   https://github.com/rajbos/ai-engineering-fluency/blob/main/docs/logFilesSchema/cline-session-format.md  (folders, token fields)
//   https://ayagmar.github.io/llm-usage-metrics/sources/cline/  (default locations, api_req_started payload)
//   https://www.prismmd.app/blog/read-cline-chat-history  (task folder layout)
// Not read: Cline 4.x CLI/SDK sessions (~/.cline/data/sessions, see https://github.com/cline/cline/discussions/15017).
// Experimental: read from those sources, not checked against a real install.
const fs = require('fs'), path = require('path'), os = require('os');
const { inspectFiles } = require('../common');
const { makeScanner } = require('../common');

const isUi = n => n === 'ui_messages.json';
const EXT = path.join('User', 'globalStorage', 'saoudrizwan.claude-dev', 'tasks');
function editorRoots() {
  const h = os.homedir(), out = [];
  if (process.platform === 'darwin') for (const e of ['Code', 'Cursor', 'Code - Insiders', 'VSCodium']) out.push(path.join(h, 'Library', 'Application Support', e, EXT));
  else if (process.platform === 'win32') for (const e of ['Code', 'Cursor', 'Code - Insiders', 'VSCodium']) out.push(path.join(process.env.APPDATA || path.join(h, 'AppData', 'Roaming'), e, EXT));
  else { for (const e of ['Code', 'Cursor', 'Code - Insiders', 'VSCodium']) out.push(path.join(h, '.config', e, EXT)); out.push(path.join(h, '.vscode-server', 'data', EXT)); }
  return out;
}
const defaultRoot = () => editorRoots()[0];
const candidates = () => editorRoots();
const json = t => { try { return JSON.parse(t); } catch { return null; } };

function parse(file, st = fs.statSync(file)) {
  const msgs = json(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(msgs)) return null;
  const id = path.basename(path.dirname(file));
  let task = '', lastSay = '', model = '', tIn = 0, tOut = 0, turns = 0, asking = false;
  for (const m of msgs) {
    if (!m || typeof m !== 'object') continue;
    if (m.modelInfo && m.modelInfo.modelId) model = m.modelInfo.modelId;
    if (m.type === 'say') {
      if (m.say === 'task' && typeof m.text === 'string') { if (!task) task = m.text.trim(); turns++; }
      else if (m.say === 'user_feedback' && m.text) turns++;
      else if (m.say === 'api_req_started') { const u = json(m.text || ''); if (u) { tIn += +u.tokensIn || 0; tOut += +u.tokensOut || 0; } }
      else if ((m.say === 'text' || m.say === 'completion_result') && m.text && !m.partial) { lastSay = m.text.trim(); asking = false; }
    } else if (m.type === 'ask' && !m.partial) {
      if (m.ask === 'followup' || m.ask === 'plan_mode_respond' || m.ask === 'act_mode_respond') {
        const q = json(m.text || ''); const t = (q && (q.question || q.response)) || m.text || '';
        if (t) { lastSay = String(t).trim(); asking = true; }
      } else if (m.ask === 'completion_result') asking = false;
      else if (m.ask === 'command' || m.ask === 'tool' || m.ask === 'use_mcp_server') { lastSay = 'Waiting for your approval: ' + (m.ask === 'command' ? 'run a command' : m.ask === 'tool' ? 'use a tool' : 'use an MCP server'); asking = true; }
    }
  }
  // Task folders do not record the working folder in ui_messages.json, so the project is named after the task.
  const proj = (task.split('\n')[0] || id).slice(0, 36);
  return {
    id, project: proj, cwd: path.dirname(file), branch: '', model, task: task.slice(0, 160), lastSay: lastSay.slice(0, 400), asking,
    updated: st.mtimeMs, tokensIn: tIn, tokensOut: tOut, turns, cost: null, hasUsage: tIn + tOut > 0
  };
}

module.exports = {
  id: 'cline', name: 'Cline', experimental: true, start: 'Open the Cline panel in VS Code and start a task',
  note: 'Reads Cline tasks (ui_messages.json) saved by the VS Code extension. Cline 4.x CLI sessions are not read yet. Experimental, from published notes. Tokens only, no price rate.',
  defaultRoot, candidates, parse,
  inspect: (root, now) => inspectFiles(root, 1, isUi, now),
  scan: makeScanner({ depth: 1, match: isUi, parse })
};
