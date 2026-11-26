#!/usr/bin/env node
'use strict';
// Raqeeb: a local dashboard for AI coding agent sessions. Zero dependencies.
const http = require('http'), fs = require('fs'), path = require('path');
const { scan, demo, defaultRoot } = require('./lib/sessions');
const pkg = require('./package.json');

function parseArgs(argv) {
  const o = { port: +(process.env.PORT || 4317), demo: false, dir: '', help: false, version: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--demo') o.demo = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a === '--port' || a === '-p') o.port = +argv[++i];
    else if (a === '--dir') o.dir = argv[++i] || '';
    else { console.error('Unknown option: ' + a); o.help = true; o.bad = true; }
  }
  return o;
}
const HELP = `Raqeeb ${pkg.version}: a local control room for your AI coding agents

Usage: raqeeb [options]

  --demo           show sample data instead of reading your sessions
  --port, -p N     port to listen on (default 4317, or $PORT)
  --dir PATH       Claude Code projects folder (default ~/.claude/projects, or $CLAUDE_CONFIG_DIR/projects)
  --version, -v    print the version
  --help, -h       show this help
`;

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };

function createServer(opts) {
  const root = opts.dir || defaultRoot();
  return http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (url === '/api/agents') {
      const real = opts.demo ? [] : scan(root);
      const isDemo = opts.demo || real.length === 0;
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ agents: isDemo ? demo() : real, demo: isDemo, found: fs.existsSync(root), root: opts.demo ? null : root, now: Date.now() }));
    }
    if (url === '/api/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: true, version: pkg.version })); }
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
  srv.listen(o.port, '127.0.0.1', () => console.log(`Raqeeb running at http://localhost:${o.port}` + (o.demo ? ' (demo data)' : '') + '\nReading: ' + (o.demo ? 'sample data' : (o.dir || defaultRoot()))));
}
module.exports = { createServer, parseArgs };
