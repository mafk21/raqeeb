#!/usr/bin/env node
'use strict';
// Raqeeb: a local dashboard for AI coding agent sessions. Zero dependencies.
const http = require('http'), fs = require('fs'), path = require('path');
const os = require('os');
const { collect, demo, demoProviders, rootFor, byId } = require('./lib/sessions');
const config = require('./lib/config');
const handoff = require('./lib/handoff');
const prompts = require('./lib/prompts'), hooks = require('./lib/hooks'), crypto = require('crypto');
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
    else if (/^--(codex|cursor|gemini|aider|cline)-dir$/.test(a)) o.dirs[a.slice(2, -4)] = argv[++i] || '';
    else { console.error('Unknown option: ' + a); o.help = true; o.bad = true; }
  }
  return o;
}
const HELP = `Raqeeb ${pkg.version}: a local control room for your AI coding agents

Usage: raqeeb [options]
       raqeeb wrap aider [aider args]                          run Aider so the dashboard can answer its (Y)es/(N)o prompts
       raqeeb hooks <print|install|uninstall> <claude|codex>   let the dashboard answer that tool

  --demo           start in demo mode with sample data (otherwise Raqeeb never shows sample data unless you click "Try demo")
  --port, -p N     port to listen on (default 4317, or $PORT)
  --dir PATH       Claude Code projects folder (default ~/.claude/projects, or $CLAUDE_CONFIG_DIR/projects)
  --version, -v    print the version
  --help, -h       show this help
`;

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };

function readBody(req, cb, max) {
  let b = ''; req.on('data', d => { b += d; if (b.length > (max || 10000)) req.destroy(); });
  req.on('end', () => { try { cb(null, JSON.parse(b || '{}')); } catch (e) { cb(e); } });
}

function createServer(opts) {
  let hookToken = '';
  opts.dirs = opts.dirs || {};
  const json = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
  const setup = () => {
    const r = collect(opts, config.load());
    return { hooks: hooks.all(), providers: r.providers.map(p => ({ ...p, candidates: byId[p.id].candidates().map(c => byId[p.id].inspect(c)), defaultRoot: byId[p.id].defaultRoot() })) };
  };
  const srv = http.createServer((req, res) => {
    // Only answer requests addressed to localhost, which blocks DNS-rebinding tricks from other sites.
    const host = (req.headers.host || '').replace(/:\d+$/, '');
    if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) { res.writeHead(403); return res.end('Forbidden'); }
    const url = req.url.split('?')[0], q = new URLSearchParams(req.url.split('?')[1] || '');
    if (url === '/api/agents') {
      if (opts.demo || q.get('demo') === '1') return json(res, 200, { agents: demo(), providers: demoProviders(), demo: true, forced: !!opts.demo, state: 'demo', now: Date.now() });
      const r = collect(opts, config.load());
      return json(res, 200, { ...r, hooks: hooks.all(), demo: false, now: Date.now() });
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
    const sameOrigin = () => { const o = req.headers.origin; return !!o && o === 'http://' + req.headers.host; };
    if (url === '/api/prompts' && req.method === 'GET') { prompts.touchViewer(); return json(res, 200, { prompts: prompts.list() }); }
    if (url === '/api/hook/request' && req.method === 'POST') {
      // Called by hook.js, never by a browser: a browser always sends an Origin header, so any request with one is refused.
      const tok = String(req.headers['x-raqeeb-token'] || '');
      if (req.headers.origin || !hookToken || tok.length !== hookToken.length || !crypto.timingSafeEqual(Buffer.from(tok), Buffer.from(hookToken))) return json(res, 403, { error: 'Forbidden' });
      return readBody(req, (e, b) => {
        if (e || !['claude', 'codex', 'aider'].includes(b.tool) || !b.payload || typeof b.payload !== 'object') return json(res, 400, { error: 'Bad request' });
        // Nobody is looking at the dashboard: do not hold the agent up, let its own prompt show.
        if (!prompts.viewerActive()) return json(res, 200, { decision: null, reason: 'no-viewer' });
        const item = prompts.create(b.tool, b.payload);
        let finished = false;
        const finish = d => { if (finished) return; finished = true; clearTimeout(timer); clearInterval(watch); prompts.remove(item.id); json(res, 200, { decision: d || null }); };
        const timer = setTimeout(() => finish(null), Math.min(Math.max(+b.wait || 120, 1), 140) * 1000);
        const watch = setInterval(() => { if (!prompts.viewerActive()) finish(null); }, 2000);
        item.done = finish;
        res.on('close', () => { if (!finished) { finished = true; clearTimeout(timer); clearInterval(watch); prompts.remove(item.id); } });
      }, 200000);
    }
    const am = url.match(/^\/api\/prompts\/([a-f0-9]{24})\/answer$/);
    if (am && req.method === 'POST') {
      if (!sameOrigin()) return json(res, 403, { error: 'Forbidden' });
      if (!/application\/json/.test(req.headers['content-type'] || '')) return json(res, 415, { error: 'Send JSON' });
      const item = prompts.get(am[1]); if (!item) return json(res, 404, { error: 'That question is no longer waiting. It may have been answered in the terminal.' });
      return readBody(req, (e, b) => {
        const d = e ? null : prompts.decide(item, b);
        if (!d) return json(res, 400, { error: 'That answer does not match the question.' });
        item.done(d.none ? null : d); json(res, 200, { ok: true });
      });
    }
    // Handoff notes. Projects are the working folders of agent sessions Raqeeb has seen, so a request cannot point at any other folder.
    const projectDirs = () => { const seen = new Set(); collect(opts, config.load()).agents.forEach(a => { if (a.cwd && path.isAbsolute(a.cwd)) { try { if (fs.statSync(a.cwd).isDirectory()) seen.add(fs.realpathSync(a.cwd)); } catch {} } }); return [...seen]; };
    if (url === '/api/handoff' && req.method === 'GET') {
      if (opts.demo || q.get('demo') === '1') return json(res, 200, { demo: true, projects: [handoff.demo()] });
      const byRoot = new Map(); projectDirs().forEach(d => { const l = handoff.list(d); const k = l.root; if (!byRoot.has(k) || byRoot.get(k).cwd.length > d.length) byRoot.set(k, l); });
      return json(res, 200, { demo: false, projects: [...byRoot.values()].sort((a, b) => (b.notes.length + b.pinned.length) - (a.notes.length + a.pinned.length) || (a.project < b.project ? -1 : 1)) });
    }
    if (url === '/api/handoff/draft' && req.method === 'GET') {
      if (opts.demo || q.get('demo') === '1') return json(res, 400, { error: 'Demo agents are made up, so there is nothing to draft from.' });
      const a = collect(opts, config.load()).agents.find(x => x.id === q.get('id'));
      let cwd = ''; try { cwd = a && fs.realpathSync(a.cwd); } catch {}
      if (!a || !cwd) return json(res, 404, { error: 'That agent session was not found, or its folder is gone.' });
      return json(res, 200, handoff.draft({ ...a, cwd }));
    }
    if (url === '/api/handoff' && req.method === 'POST') {
      if (!sameOrigin()) return json(res, 403, { error: 'Forbidden' });
      if (!/application\/json/.test(req.headers['content-type'] || '')) return json(res, 415, { error: 'Send JSON' });
      return readBody(req, (e, b) => {
        if (e) return json(res, 400, { error: 'Bad request' });
        if (opts.demo) return json(res, 400, { error: 'Demo mode does not save notes.' });
        let cwd = ''; try { cwd = fs.realpathSync(String(b.cwd || '')); } catch {}
        if (!cwd || !projectDirs().includes(cwd)) return json(res, 400, { error: 'Raqeeb only saves notes for projects it has seen an agent session in.' });
        const r = b.action === 'retire' ? handoff.retire(cwd, b.name) : b.action === 'save' ? handoff.save(cwd, b) : { error: 'Unknown action' };
        json(res, r.error ? 400 : 200, r);
      }, 20000);
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
  // The hook helper finds this server and its token in ~/.raqeeb/hook.json (readable only by you).
  srv.on('listening', () => {
    hookToken = crypto.randomBytes(24).toString('hex');
    try { const f = path.join(path.dirname(config.file()), 'hook.json'); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify({ port: srv.address().port, token: hookToken }), { mode: 0o600 }); fs.chmodSync(f, 0o600); } catch {}
  });
  return srv;
}

if (require.main === module && process.argv[2] === 'wrap') {
  const r = require('child_process').spawnSync('python3', [path.join(__dirname, 'wrap.py'), ...process.argv.slice(3)], { stdio: 'inherit' });
  if (r.error) { console.error('The wrapper needs python3 (standard library only): ' + r.error.message); process.exit(1); }
  process.exit(r.status == null ? 1 : r.status);
}
if (require.main === module && process.argv[2] === 'hooks') {
  const [, , , act, tool] = process.argv, ok = ['print', 'install', 'uninstall', 'status'];
  if (!ok.includes(act) || (act !== 'status' && !hooks.SUPPORT[tool])) {
    console.error('Usage: raqeeb hooks <print|install|uninstall> <claude|codex>\n       raqeeb hooks status\nSupported: ' + Object.keys(hooks.SUPPORT).join(', '));
    process.exit(1);
  }
  try {
    if (act === 'print') console.log(JSON.stringify(hooks.snippet(tool), null, 2));
    else if (act === 'status') console.log(JSON.stringify(hooks.all(), null, 2));
    else { const r = hooks[act](tool); console.log((r.changed ? (act === 'install' ? 'Added the Raqeeb hook to ' : 'Removed the Raqeeb hook from ') : 'No change needed in ') + r.file + (r.backup ? '\nBackup: ' + r.backup : '') + (act === 'install' ? '\n' + hooks.SUPPORT[tool].after : '')); }
  } catch (e) { console.error('Could not change the file: ' + e.message + '. Nothing was written.'); process.exit(1); }
  process.exit(0);
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
