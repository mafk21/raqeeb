#!/usr/bin/env node
'use strict';
// Raqeeb: a local dashboard for AI coding agent sessions. Zero dependencies.
const http = require('http'), fs = require('fs'), path = require('path');
const os = require('os');
const { collect, demo, demoProviders, rootFor, byId } = require('./lib/sessions');
const config = require('./lib/config');
const pkg = require('./package.json');

function parseArgs(argv) {
  const o = { port: +(process.env.PORT || 4317), demo: false, dirs: {}, help: false, version: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--demo') o.demo = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a === '--port' || a === '-p') o.port = +argv[++i];
    else if (a === '--dir' || a === '--claude-dir') o.dirs.claude = argv[++i] || '';
    else if (a === '--codex-dir') o.dirs.codex = argv[++i] || '';
    else if (a === '--cursor-dir') o.dirs.cursor = argv[++i] || '';
    else { console.error('Unknown option: ' + a); o.help = true; o.bad = true; }
  }
  return o;
}
const HELP = `Raqeeb ${pkg.version}: a local control room for your AI coding agents

Usage: raqeeb [options]

  --demo           start in demo mode with sample data (otherwise Raqeeb never shows sample data unless you click "Try demo")
  --port, -p N     port to listen on (default 4317, or $PORT)
  --dir PATH       Claude Code projects folder (default ~/.claude/projects, or $CLAUDE_CONFIG_DIR/projects)
  --version, -v    print the version
  --help, -h       show this help
`;

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };

function readBody(req, cb) {
  let b = ''; req.on('data', d => { b += d; if (b.length > 10000) req.destroy(); });
  req.on('end', () => { try { cb(null, JSON.parse(b || '{}')); } catch (e) { cb(e); } });
}

function createServer(opts) {
  opts.dirs = opts.dirs || {};
  const json = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
  const setup = () => {
    const r = collect(opts, config.load());
    return { providers: r.providers.map(p => ({ ...p, candidates: byId[p.id].candidates().map(c => byId[p.id].inspect(c)), defaultRoot: byId[p.id].defaultRoot() })) };
  };
  return http.createServer((req, res) => {
    // Only answer requests addressed to localhost, which blocks DNS-rebinding tricks from other sites.
    const host = (req.headers.host || '').replace(/:\d+$/, '');
    if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) { res.writeHead(403); return res.end('Forbidden'); }
    const url = req.url.split('?')[0], q = new URLSearchParams(req.url.split('?')[1] || '');
    if (url === '/api/agents') {
      if (opts.demo || q.get('demo') === '1') return json(res, 200, { agents: demo(), providers: demoProviders(), demo: true, forced: !!opts.demo, state: 'demo', now: Date.now() });
      const r = collect(opts, config.load());
      return json(res, 200, { ...r, demo: false, now: Date.now() });
    }
    if (url === '/api/setup' && req.method === 'GET') return json(res, 200, setup());
    if (url === '/api/setup' && req.method === 'POST') {
      // Same-origin only, so a web page you visit cannot change a folder.
      const origin = req.headers.origin;
      if (origin && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)) return json(res, 403, { error: 'Forbidden' });
      if (!/application\/json/.test(req.headers['content-type'] || '')) return json(res, 415, { error: 'Send JSON' });
      return readBody(req, (e, b) => {
        if (e) return json(res, 400, { error: 'Bad request' });
        const id = String(b.provider || 'claude'), p = byId[id];
        if (!p) return json(res, 400, { error: 'Unknown provider' });
        if (opts.dirs[id]) return json(res, 409, { error: 'The folder is fixed by a command-line option for this run.' });
        const cfg = config.load(); cfg.dirs = cfg.dirs || {};
        let dir = String(b.dir || '').trim();
        if (!dir) { delete cfg.dirs[id]; if (id === 'claude') delete cfg.dir; config.save(cfg); return json(res, 200, setup()); }
        if (dir.startsWith('~')) dir = path.join(os.homedir(), dir.slice(1));
        if (!path.isAbsolute(dir)) return json(res, 400, { error: 'Enter the full path, for example ' + p.defaultRoot() });
        const info = p.inspect(dir);
        if (!info.exists || !info.isDir) return json(res, 400, { error: 'That folder does not exist: ' + dir });
        cfg.dirs[id] = path.resolve(dir); if (id === 'claude') delete cfg.dir; config.save(cfg);
        json(res, 200, setup());
      });
    }
    if (url === '/api/health') return json(res, 200, { ok: true, version: pkg.version });
    const pub = path.join(__dirname, 'public');
    const f = path.normalize(path.join(pub, url === '/' ? 'index.html' : url));
    if (!f.startsWith(pub + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
    fs.readFile(f, (e, d) => {
      if (e) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d);
    });
  });
}

if (require.main === module) {
  const o = parseArgs(process.argv.slice(2));
  if (o.version) { console.log(pkg.version); process.exit(0); }
  if (o.help) { console.log(HELP); process.exit(o.bad ? 1 : 0); }
  if (!Number.isInteger(o.port) || o.port < 1 || o.port > 65535) { console.error('Invalid port.'); process.exit(1); }
  const srv = createServer(o);
  srv.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Port ${o.port} is in use. Try: raqeeb --port ${o.port + 1}` : e.message); process.exit(1); });
  srv.listen(o.port, '127.0.0.1', () => console.log(`Raqeeb running at http://localhost:${o.port}` + (o.demo ? ' (demo data)' : '') + (o.demo ? '' : '\n' + require('./lib/providers').list.map(p => p.name + ': ' + rootFor(p.id, o, config.load())).join('\n'))));
}
module.exports = { createServer, parseArgs };
