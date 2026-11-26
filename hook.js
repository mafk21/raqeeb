#!/usr/bin/env node
'use strict';
// Hook helper run by Claude Code or Codex CLI when they are about to ask you for permission.
// It asks the local Raqeeb dashboard and prints the answer. If Raqeeb is not running, nobody is watching the
// dashboard, the answer takes too long, or anything goes wrong, it prints nothing and exits 0, which makes the
// tool show its normal terminal prompt. It can never approve anything by itself.
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const tool = process.argv[2];
const done = out => { if (out) process.stdout.write(JSON.stringify(out)); process.exit(0); };
if (!['claude', 'codex'].includes(tool)) done();
let input = ''; process.stdin.setEncoding('utf8');
process.stdin.on('data', d => { input += d; if (input.length > 2e6) done(); });
process.stdin.on('end', () => {
  let payload, cfg;
  try { payload = JSON.parse(input); } catch { return done(); }
  try { cfg = JSON.parse(fs.readFileSync(path.join(process.env.RAQEEB_HOME || path.join(os.homedir(), '.raqeeb'), 'hook.json'), 'utf8')); } catch { return done(); }
  const wait = Math.min(Math.max(+process.env.RAQEEB_HOOK_WAIT || 120, 1), 140);
  const body = JSON.stringify({ tool, wait, payload });
  const req = http.request({ host: '127.0.0.1', port: cfg.port, path: '/api/hook/request', method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Raqeeb-Token': cfg.token, 'Content-Length': Buffer.byteLength(body) } }, res => {
    let b = ''; res.on('data', d => b += d);
    res.on('end', () => {
      if (res.statusCode !== 200) return done();
      try { const d = JSON.parse(b).decision; if (d && (d.behavior === 'allow' || d.behavior === 'deny')) return done({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: d } }); } catch {}
      done();
    });
  });
  req.on('error', () => done());
  req.setTimeout((wait + 10) * 1000, () => { req.destroy(); done(); });
  req.end(body);
});
