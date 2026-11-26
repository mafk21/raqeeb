'use strict';
// Setting up the hooks that let the dashboard answer an agent. Supported: Claude Code and Codex CLI.
// Raqeeb never edits a settings file unless you run `raqeeb hooks install`; it keeps a backup next to the file.
const fs = require('fs'), path = require('path'), os = require('os');
const HOOK = path.join(__dirname, '..', 'hook.js');
const SUPPORT = {
  claude: { name: 'Claude Code', file: () => path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'settings.json'), matcher: '*', does: 'Approve or deny a permission prompt, and answer multiple-choice questions.', after: 'Restart running Claude Code sessions so they pick up the hook.' },
  codex: { name: 'Codex CLI', file: () => path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'hooks.json'), matcher: '*', does: 'Approve or deny an approval prompt.', after: 'Open /hooks in Codex and trust the new hook, then restart the session.' }
};
const WHY_NOT = {
  gemini: 'Its hook runs before every tool call, not only when you are asked, so Raqeeb cannot tell a real approval prompt from a routine call.',
  cursor: 'Its hooks run before every shell command, not only when you are asked, so Raqeeb cannot tell a real approval prompt from a routine call.',
  cline: 'It asks inside the VS Code panel. Its extension API can press the approve button, but that needs a companion VS Code extension, which Raqeeb does not have yet.'
};
const quote = s => '"' + String(s).replace(/(["\\$`])/g, '\\$1') + '"';
const command = tool => `${quote(process.execPath)} ${quote(HOOK)} ${tool}`;
function entry(tool) { return { matcher: SUPPORT[tool].matcher, hooks: [{ type: 'command', command: command(tool), timeout: 150, statusMessage: 'Waiting for the Raqeeb dashboard' }] }; }
const mine = e => e && Array.isArray(e.hooks) && e.hooks.some(h => h && (h.statusMessage === 'Waiting for the Raqeeb dashboard' || (typeof h.command === 'string' && h.command.includes(HOOK))));
function read(file) { if (!fs.existsSync(file)) return {}; const j = JSON.parse(fs.readFileSync(file, 'utf8') || '{}'); if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('not a JSON object'); return j; }
function status(tool) {
  if (tool === 'aider') return { supported: true, mode: 'wrap', installed: false, does: 'Answer its (Y)es/(N)o confirmations (run this command, add this file, and so on).', after: 'Aider itself is unchanged. The wrapper runs it in a pseudo-terminal, needs python3, and only works for Aider sessions you start this way.', install: 'raqeeb wrap aider' };
  const s = SUPPORT[tool]; if (!s) return { supported: false, why: WHY_NOT[tool] || 'Not supported.' };
  const file = s.file(); let installed = false, error = null;
  try { const j = read(file); installed = ((j.hooks || {}).PermissionRequest || []).some(mine); } catch (e) { error = e.message; }
  return { supported: true, file, installed, error, does: s.does, after: s.after, install: 'raqeeb hooks install ' + tool };
}
function snippet(tool) { return { hooks: { PermissionRequest: [entry(tool)] } }; }
function install(tool) {
  const s = SUPPORT[tool]; if (!s) throw new Error('Not supported: ' + tool);
  const file = s.file(), j = read(file);
  j.hooks = j.hooks || {}; const arr = j.hooks.PermissionRequest = Array.isArray(j.hooks.PermissionRequest) ? j.hooks.PermissionRequest : [];
  if (arr.some(mine)) return { file, changed: false };
  let backup = null; fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) { backup = file + '.raqeeb-backup'; fs.copyFileSync(file, backup); }
  arr.push(entry(tool)); fs.writeFileSync(file, JSON.stringify(j, null, 2) + '\n');
  return { file, changed: true, backup };
}
function uninstall(tool) {
  const s = SUPPORT[tool]; if (!s) throw new Error('Not supported: ' + tool);
  const file = s.file(); if (!fs.existsSync(file)) return { file, changed: false };
  const j = read(file), arr = (j.hooks || {}).PermissionRequest; if (!Array.isArray(arr) || !arr.some(mine)) return { file, changed: false };
  fs.copyFileSync(file, file + '.raqeeb-backup');
  j.hooks.PermissionRequest = arr.filter(e => !mine(e)); if (!j.hooks.PermissionRequest.length) delete j.hooks.PermissionRequest; if (!Object.keys(j.hooks).length) delete j.hooks;
  fs.writeFileSync(file, JSON.stringify(j, null, 2) + '\n'); return { file, changed: true };
}
const all = () => Object.fromEntries(['claude', 'codex', 'cursor', 'gemini', 'aider', 'cline'].map(t => [t, status(t)]));
module.exports = { SUPPORT, WHY_NOT, status, all, snippet, install, uninstall, command };
