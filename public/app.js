const $ = s => document.querySelector(s), root = document.documentElement;
root.dataset.theme = (location.hash == '#dark' ? 'dark' : null) || localStorage.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
$('#theme').onclick = () => { root.dataset.theme = localStorage.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mono = s => `<code>${esc(s)}</code>`;
const ago = ms => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; };
const money = c => c == null ? null : '~$' + c.toFixed(2);
const tok = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n);
const costText = a => a.cost != null ? money(a.cost) : a.hasUsage ? tok(a.tokensIn + a.tokensOut) + ' tokens' : 'no usage data';
let agents = [], providers = [], filter = 'all', pfilter = 'all', last = '', animate = true, demoOn = sessionStorage.demo === '1', showSetup = false, setupData = null;
const bucket = a => a.status === 'idle' ? 'working' : a.status;
const badge = p => `<span class="tag t-${esc(p.id || p.provider)}">${esc(p.name || p.tool)}${p.experimental ? '<i title="Experimental: built from published format notes, not yet checked against a real install">beta</i>' : ''}</span>`;
const provOf = a => providers.find(p => p.id === a.provider) || { id: a.provider, name: a.tool };

$('#drawer').onclick = e => { if (e.target.id === 'drawer') $('#drawer').classList.remove('open'); };
window.open_ = id => { const a = agents.find(x => x.id === id); if (!a) return;
  $('#panel').innerHTML = `<h3>${esc(a.project)}</h3><div class="meta">${badge(provOf(a))} ${esc(a.branch || 'no branch')} ${a.model ? '· ' + esc(a.model) : ''}</div><span class="pill" style="display:inline-block">${a.status}</span>
  <div class="k">Task</div><pre>${esc(a.task)}</pre><div class="k">Last message</div><pre>${esc(a.lastSay)}</pre>${a.question ? `<div class="k">Waiting on you</div><pre>${esc(a.question)}</pre>` : ''}
  <div class="k">Usage</div><pre>${a.hasUsage ? `${a.tokensIn.toLocaleString()} tokens in, ${a.tokensOut.toLocaleString()} out\n` : 'This tool does not record token usage in the files Raqeeb reads.\n'}${a.cost != null ? 'Estimated cost ' + money(a.cost) : a.hasUsage ? 'No price rate set for this model (edit lib/pricing.js)' : ''}\nWorking directory: ${esc(a.cwd)}</pre><p><button class="btn" onclick="document.getElementById('drawer').classList.remove('open')">Close</button></p>`;
  $('#drawer').classList.add('open'); };

const dis = () => { try { return JSON.parse(localStorage.dismissed || '{}'); } catch { return {}; } };
let showDismissed = false;
window.dismiss = (id, u) => { const d = dis(); d[id] = u; localStorage.dismissed = JSON.stringify(d); last = ''; refresh(true); };
window.undismiss = () => { localStorage.dismissed = '{}'; showDismissed = false; last = ''; refresh(true); };
window.copyCd = (id, btn) => { const a = agents.find(x => x.id === id); if (!a) return; const t = 'cd ' + JSON.stringify(a.cwd); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { btn.textContent = 'Copied'; }, () => { prompt('Copy this command', t); }); setTimeout(() => { btn.textContent = 'Copy folder'; }, 1800); };
const where = a => a.cwd && a.cwd.startsWith('/') ? a.cwd : '';
function needCard(a) {
  const age = Math.max(1, Math.round((Date.now() - a.updated) / 60000));
  return `<div class="need"><div class="need-h">${badge(provOf(a))}<b>${esc(a.project)}</b>${a.branch ? `<code>${esc(a.branch)}</code>` : ''}<span class="sp"></span><span class="age ${age >= 30 ? 'old' : ''}">waiting ${age < 60 ? age + ' min' : Math.round(age / 60) + ' h'}</span></div>
  <div class="need-q">${esc(a.question || a.lastSay)}</div>
  <div class="need-t">Task: ${esc(a.task)}</div>
  <div class="need-a"><button class="btn sm" onclick="open_('${esc(a.id)}')">Details</button>${where(a) ? `<button class="btn sm" onclick="copyCd('${esc(a.id)}',this)">Copy folder</button>` : ''}<span class="sp"></span><button class="btn sm ghost" title="Hide until this agent says something new" onclick="dismiss('${esc(a.id)}',${a.updated})">Dismiss</button></div>
  <div class="need-n">Answer in the terminal or app where this agent runs.</div></div>`;
}
function row(a) {
  return `<div class="arow ${a.status}" onclick="open_('${esc(a.id)}')"><span class="dot"></span><b>${esc(a.project)}</b>${badge(provOf(a))}<span class="at">${esc(a.task)}</span><span class="sp"></span><span class="pill">${a.status === 'idle' ? 'idle' : a.status}</span><small>${ago(a.updated)}</small><small class="cost">${costText(a)}</small></div>`;
}
function draw() {
  const d = dis(), inView = a => pfilter === 'all' || a.provider === pfilter;
  const asks = agents.filter(a => a.status === 'waiting' && inView(a)).sort((x, y) => x.updated - y.updated);
  const hidden = asks.filter(a => d[a.id] === a.updated), shown = asks.filter(a => d[a.id] !== a.updated);
  $('#needn').textContent = shown.length ? shown.length : '';
  $('#dismissed').innerHTML = hidden.length ? `${hidden.length} dismissed <button class="link" onclick="undismiss()">show again</button>` : '';
  const working = agents.filter(a => a.status === 'working' && inView(a)).length + agents.filter(a => a.status === 'idle' && inView(a)).length;
  $('#needs').innerHTML = shown.length ? shown.map(needCard).join('') : `<div class="calm"><b>${asks.length ? 'Everything is dismissed.' : 'Nothing is waiting on you.'}</b><span>${agents.length ? (working ? working + ' agent' + (working === 1 ? ' is' : 's are') + ' still working. ' : '') + 'When an agent stops to ask a question, it shows up here first.' : 'When an agent stops to ask a question, it shows up here first.'}</span></div>`;
  const rest = agents.filter(a => a.status !== 'waiting' && inView(a));
  const g = (t, l) => l.length ? `<div class="grp">${t} <em>${l.length}</em></div>` + l.map(row).join('') : '';
  const live = rest.filter(a => a.status === 'working' || a.status === 'idle'), fin = rest.filter(a => a.status === 'done');
  $('#board').innerHTML = rest.length ? g('Working', live) + g('Finished', fin) : `<div class="empty">${pfilter === 'all' ? 'No other agents right now.' : 'No ' + esc((providers.find(p => p.id === pfilter) || {}).name) + ' sessions besides the ones above.'}</div>`;
  const n = asks.length - hidden.length;
  document.title = (n ? '(' + n + ') ' : '') + 'Raqeeb';
  $('#summary').innerHTML = `<div class="sum-main ${n ? 'hot' : ''}"><b>${n ? n + (n === 1 ? ' agent needs you' : ' agents need you') : 'No agent is waiting on you'}</b><span>${agents.filter(a => a.status === 'working' || a.status === 'idle').length} working · ${agents.filter(a => a.status === 'done').length} finished · ${spendLine()}</span></div>`;
}
function spendLine() {
  const known = agents.reduce((s, a) => s + (a.cost || 0), 0), unpriced = agents.filter(a => a.cost == null && a.hasUsage).length;
  return (known ? '~$' + known.toFixed(2) + ' est.' : 'no priced spend') + (unpriced ? ' (+' + unpriced + ' tokens only)' : '');
}
function drawProviderFilter() {
  const items = [['all', 'All', agents.filter(a => a.status !== 'waiting').length], ...providers.map(p => [p.id, p.name, agents.filter(a => a.provider === p.id && a.status !== 'waiting').length])];
  $('#pseg').innerHTML = items.map(([id, n, c]) => `<button data-p="${esc(id)}" class="${pfilter === id ? 'on' : ''}">${esc(n)} <small>${c}</small></button>`).join('');
  document.querySelectorAll('#pseg button').forEach(b => b.onclick = () => { pfilter = b.dataset.p; drawProviderFilter(); draw(); });
}
const provLine = p => p.state === 'demo' ? `${p.count} sample` : p.state === 'ok' ? `${p.count} active in the last 24 h` : p.state === 'no-sessions' ? `no sessions in 24 h (${p.info.files} older)` : 'folder not found';

async function post(url, body) { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { ok: r.ok, body: await r.json() }; }
const rerun = async () => { setupData = null; last = ''; await refresh(true); };

function provCard(p) {
  const info = p.info, found = info.exists && info.isDir;
  const cls = p.state === 'ok' ? 'good' : p.state === 'no-sessions' ? 'warn' : 'bad';
  const msg = p.state === 'ok' ? `Found ${p.count} active session${p.count === 1 ? '' : 's'} (${info.files} files in all).`
      : p.state === 'no-sessions' && !info.files ? 'Folder found, but no session files in it yet.'
    : p.state === 'no-sessions' ? `Folder found with ${info.files} older session file${info.files === 1 ? '' : 's'}, none in the last 24 hours.`
    : `No folder at ${mono(p.root)}.`;
  const cands = (p.candidates || []).filter(c => c.exists && c.isDir && c.path !== p.root);
  return `<div class="ob-step prov" data-id="${esc(p.id)}"><div class="prov-h">${badge(p)}<span class="st ${cls}">${p.state === 'ok' ? 'Detected' : p.state === 'no-sessions' ? 'Nothing recent' : 'Not found'}</span></div>
    <p>${msg}</p>
    <form class="dirform"><input value="${esc(p.root)}" spellcheck="false" aria-label="${esc(p.name)} folder" ${p.locked ? 'readonly' : ''}><div class="ob-row"><button class="btn sm pri" type="submit" ${p.locked ? 'disabled' : ''}>Save and scan</button><button class="btn sm reset" type="button" ${p.locked ? 'disabled' : ''}>Use default</button></div></form>
    <div class="ob-msg">${p.locked ? 'Fixed by a command-line option for this run.' : ''}</div>
    ${cands.map(c => `<button class="cand" data-p="${esc(c.path)}"><span>${esc(c.path)}</span><em>${c.files} file${c.files === 1 ? '' : 's'}</em></button>`).join('')}
    <div class="ob-k">To start one</div><pre class="cmd">${esc(p.start)}</pre>
    <div class="note">${esc(p.note)}</div></div>`;
}

function onboard(r, setup) {
  const ps = setup.providers, any = ps.some(p => p.state === 'ok'), found = ps.filter(p => p.info.exists && p.info.files > 0);
  const headline = any ? 'Setup' : found.length ? 'No agent sessions in the last 24 hours' : 'Raqeeb could not find any agent sessions';
  const detail = any ? 'These are the tools Raqeeb checks and where it looks. Change a folder if yours lives somewhere else.'
    : found.length ? 'Raqeeb found session files for at least one tool, but none was touched in the last 24 hours.' : 'None of the supported tools has a session folder at the usual place on this computer.';
  $('#onboard').innerHTML = `<div class="ob"><div class="ob-head"><span class="ob-tag">${any ? 'Setup' : found.length ? 'Nothing to show yet' : 'First run'}</span><h1>${headline}</h1>
    <p>${detail} ${any ? '' : 'No sample data is shown. '}Everything on this page comes from your own session files, read-only.</p></div>
    <div class="ob-grid3">${ps.map(provCard).join('')}</div>
    <div class="ob-foot"><div><b>Next:</b> start a session in any of these tools, then press <button class="btn sm pri" id="rescan">Re-scan now</button> or wait, Raqeeb re-scans every 5 seconds. <span id="scanmsg" class="ob-msg"></span></div>
    <div>Just want to look around? <button class="btn sm" id="trydemo">Try demo with sample data</button></div></div></div>`;
  document.querySelectorAll('.prov').forEach(el => {
    const id = el.dataset.id;
    el.querySelector('.dirform').onsubmit = async e => { e.preventDefault(); const m = el.querySelector('.ob-msg'); m.textContent = 'Checking...'; const x = await post('/api/setup', { provider: id, dir: el.querySelector('input').value }); m.textContent = x.ok ? '' : x.body.error; if (x.ok) await rerun(); };
    el.querySelector('.reset').onclick = async () => { await post('/api/setup', { provider: id, dir: '' }); await rerun(); };
    el.querySelectorAll('.cand').forEach(b => b.onclick = async () => { await post('/api/setup', { provider: id, dir: b.dataset.p }); await rerun(); });
  });
  $('#rescan').onclick = async () => { $('#scanmsg').textContent = 'Scanning...'; last = ''; await refresh(true); const n = $('#scanmsg'); if (n) n.textContent = 'Scanned just now.'; };
  $('#trydemo').onclick = () => { demoOn = true; sessionStorage.demo = '1'; last = ''; refresh(true); };
}
$('#setupbtn').onclick = () => { showSetup = !showSetup; last = ''; refresh(true); };

async function refresh(force) {
  const r = await (await fetch('/api/agents' + (demoOn ? '?demo=1' : ''))).json();
  const needSetup = !r.demo && (r.state !== 'ok' || showSetup);
  if (needSetup && !setupData) setupData = await (await fetch('/api/setup')).json();
  if (!needSetup) setupData = null;
  const sig = JSON.stringify([r.state, showSetup, localStorage.dismissed, r.providers.map(p => [p.id, p.root, p.state, p.count]), r.agents.map(a => [a.id, a.status, a.updated, a.lastSay])]);
  if (!force && sig === last) return; last = sig;
  agents = r.agents; providers = r.providers;
  $('#onboard').hidden = !needSetup; $('#dash').hidden = needSetup;
  $('#banner').innerHTML = r.demo ? `<div class="banner demo"><b>DEMO</b> These are made-up sample agents, not your sessions. ${r.forced ? '' : '<button class="btn sm" id="exitdemo">Exit demo</button>'}</div>` : '';
  if ($('#exitdemo')) $('#exitdemo').onclick = () => { demoOn = false; sessionStorage.demo = '0'; last = ''; refresh(true); };
  if (needSetup) return onboard(r, setupData);
  if (pfilter !== 'all' && !providers.some(p => p.id === pfilter)) pfilter = 'all';
  drawProviderFilter(); draw(); animate = false;
  $('#provs').innerHTML = providers.map(p => `<div class="sp-row prow"><span>${badge(p)}</span><small class="${p.state === 'ok' || p.state === 'demo' ? '' : 'dim'}">${esc(provLine(p))}</small></div>`).join('') + (r.demo ? '' : '<div class="note">Not seeing a tool? Press <b>Setup</b> to check its folder.</div>');
  const sum = (key, list) => { const o = {}; list.forEach(a => { const k = key(a); o[k] = o[k] || { cost: 0, tok: 0, priced: 0, n: 0 }; o[k].n++; o[k].tok += a.tokensIn + a.tokensOut; if (a.cost != null) { o[k].cost += a.cost; o[k].priced++; } }); return o; };
  const row = (n, v) => `<div class="sp-row"><span>${esc(n)}</span><b>${v.priced ? '~$' + v.cost.toFixed(2) : v.tok ? tok(v.tok) + ' tokens' : 'no usage data'}</b></div>`;
  $('#spendp').innerHTML = providers.map(p => { const v = sum(a => a.provider, agents)[p.id]; return v ? row(p.name, v) : ''; }).join('') || '<div class="empty">No spend yet.</div>';
  $('#spend').innerHTML = Object.entries(sum(a => a.project, agents)).sort((a, b) => b[1].cost - a[1].cost).map(([n, v]) => row(n, v)).join('') || '<div class="empty">No spend yet.</div>';
}
refresh().catch(() => {}); setInterval(() => { if (!document.activeElement || document.activeElement.tagName !== 'INPUT') refresh().catch(() => {}); }, 5000);
