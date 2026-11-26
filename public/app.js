const $ = s => document.querySelector(s), root = document.documentElement;
root.dataset.theme = (location.hash == '#dark' ? 'dark' : null) || localStorage.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
$('#theme').onclick = () => { root.dataset.theme = localStorage.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mono = s => `<code>${esc(s)}</code>`;
const ago = ms => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; };
const money = c => c == null ? null : '~$' + c.toFixed(2);
const tok = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n);
const costText = a => a.cost != null ? money(a.cost) : a.hasUsage ? tok(a.tokensIn + a.tokensOut) + ' tokens' : 'no usage data';
let prompts = [], hooksInfo = {}, sel = {}, agents = [], providers = [], filter = 'all', pfilter = 'all', last = '', animate = true, demoOn = sessionStorage.demo === '1', showSetup = false, setupData = null;
const bucket = a => a.status === 'idle' ? 'working' : a.status;
const badge = p => `<span class="tag t-${esc(p.id || p.provider)}">${esc(p.name || p.tool)}${p.experimental ? '<i title="Experimental: built from published format notes, not yet checked against a real install">beta</i>' : ''}</span>`;
const provOf = a => providers.find(p => p.id === a.provider) || { id: a.provider, name: a.tool };

$('#drawer').onclick = e => { if (e.target.id === 'drawer') $('#drawer').classList.remove('open'); };
window.open_ = id => { const a = agents.find(x => x.id === id); if (!a) return;
  $('#panel').innerHTML = `<h3>${esc(a.project)}</h3><div class="meta">${badge(provOf(a))} ${esc(a.branch || 'no branch')} ${a.model ? '· ' + esc(a.model) : ''}</div><span class="pill" style="display:inline-block">${a.status}</span>
  <div class="k">Task</div><pre>${esc(a.task)}</pre><div class="k">Last message</div><pre>${esc(a.lastSay)}</pre>${a.question ? `<div class="k">Waiting on you</div><pre>${esc(a.question)}</pre>` : ''}
  <div class="k">Usage</div><pre>${a.hasUsage ? `${a.tokensIn.toLocaleString()} tokens in, ${a.tokensOut.toLocaleString()} out\n` : 'This tool does not record token usage in the files Raqeeb reads.\n'}${a.cost != null ? 'Estimated cost ' + money(a.cost) : a.hasUsage ? 'No price rate set for this model (edit lib/pricing.js)' : ''}\nWorking directory: ${esc(a.cwd)}</pre><p>${where(a) && !a.demo ? `<button class="btn pri" onclick="saveHandoff('${esc(a.id)}')">Save handoff</button> ` : ''}<button class="btn" onclick="document.getElementById('drawer').classList.remove('open')">Close</button></p>`;
  $('#drawer').classList.add('open'); };

const dis = () => { try { return JSON.parse(localStorage.dismissed || '{}'); } catch { return {}; } };
let showDismissed = false;
window.dismiss = (id, u) => { const d = dis(); d[id] = u; localStorage.dismissed = JSON.stringify(d); last = ''; refresh(true); };
window.undismiss = () => { localStorage.dismissed = '{}'; showDismissed = false; last = ''; refresh(true); };
window.copyCd = (id, btn) => { const a = agents.find(x => x.id === id); if (!a) return; const t = 'cd ' + JSON.stringify(a.cwd); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { btn.textContent = 'Copied'; }, () => { prompt('Copy this command', t); }); setTimeout(() => { btn.textContent = 'Copy folder'; }, 1800); };
const where = a => a.cwd && a.cwd.startsWith('/') ? a.cwd : '';
const hint = a => {
  const h = hooksInfo[a.provider] || {}, name = esc(provOf(a).name);
  if (h.mode === 'wrap') return `Answer in the terminal, or start ${name} with <code>${esc(h.install)}</code> to answer from here.`;
  if (h.supported && h.installed) return `Answer in the terminal. Dashboard answering is on for ${name}, but this question did not arrive through it (restart the session after setting it up).`;
  if (h.supported) return `Answer in the terminal, or <button class="link" onclick="openSetup()">set up answering from here</button> for ${name}.`;
  return `Answer in the terminal or app where this agent runs. Raqeeb cannot answer for ${name}: ${esc(h.why || 'not supported')}`;
};
window.openSetup = () => { showSetup = true; last = ''; refresh(true); };
window.pick = (pid, qi, oi, multi) => { const p = prompts.find(x => x.id === pid); if (!p) return; const l = p.questions[qi].options[oi].label; sel[pid] = sel[pid] || {}; let cur = sel[pid][qi] || [];
  cur = multi ? (cur.includes(l) ? cur.filter(x => x !== l) : [...cur, l]) : [l]; sel[pid][qi] = cur; paintSel(pid); };
function paintSel(pid) { const p = prompts.find(x => x.id === pid); if (!p) return; const el = document.querySelector(`[data-pid="${pid}"]`); if (!el) return;
  p.questions.forEach((q, qi) => q.options.forEach((o, oi) => { const b = el.querySelector(`[data-o="${qi}-${oi}"]`); if (b) b.classList.toggle('on', ((sel[pid] || {})[qi] || []).includes(o.label)); }));
  const ok = p.questions.every((q, qi) => ((sel[pid] || {})[qi] || []).length); const send = el.querySelector('.send'); if (send) send.disabled = !ok; }
window.answer = async (pid, action, choice) => { const p = prompts.find(x => x.id === pid); if (!p) return; const body = { action }; if (choice) body.choice = choice;
  if (action === 'answer') { body.answers = {}; p.questions.forEach((q, qi) => { const v = (sel[pid] || {})[qi] || []; body.answers[q.question] = q.multiSelect ? v : v[0]; }); }
  const el = document.querySelector(`[data-pid="${pid}"] .need-n`); if (el) el.textContent = 'Sending...';
  const x = await post('/api/prompts/' + pid + '/answer', body);
  if (el) el.textContent = x.ok ? (action === 'terminal' ? 'Handed back to the terminal.' : 'Sent. The agent should continue in a moment.') : x.body.error;
  if (x.ok) setTimeout(pollPrompts, 300); };
function promptBody(a) {
  const p = a.prompt, pid = esc(p.id);
  if (p.kind === 'question') return `<div class="need-q">${esc(p.title)}</div>` + p.questions.map((q, qi) => `<div class="qq"><div class="qh">${q.header ? `<em>${esc(q.header)}</em>` : ''}${esc(q.question)}${q.multiSelect ? ' <small>(pick any)</small>' : ''}</div><div class="opts">${q.options.map((o, oi) => `<button class="opt" data-o="${qi}-${oi}" onclick="pick('${pid}',${qi},${oi},${q.multiSelect})"><b>${esc(o.label)}</b>${o.description ? `<span>${esc(o.description)}</span>` : ''}</button>`).join('')}</div></div>`).join('')
    + `<div class="need-a"><button class="btn sm pri send" disabled onclick="answer('${pid}','answer')">Send answer</button><button class="btn sm" onclick="answer('${pid}','terminal')">Answer in terminal instead</button></div>`;
  if (p.kind === 'choice') return `<div class="need-q">${esc(p.title)}</div>${p.detail ? `<pre class="need-d">${esc(p.detail)}</pre>` : ''}<div class="need-a">${p.options.map((o, i) => `<button class="btn sm ${i === 0 ? 'pri' : ''}" onclick="answer('${pid}','choose','${esc(o.key)}')">${esc(o.label)}</button>`).join('')}<button class="btn sm ghost" onclick="answer('${pid}','terminal')">Answer in terminal instead</button></div>`;
  return `<div class="need-q">${esc(p.title)}</div>${p.detail ? `<pre class="need-d">${esc(p.detail)}</pre>` : ''}${p.reason ? `<div class="need-t">${esc(p.reason)}</div>` : ''}
    <div class="need-a"><button class="btn sm pri" onclick="answer('${pid}','allow')">Approve</button><button class="btn sm" onclick="answer('${pid}','deny')">Deny</button><button class="btn sm ghost" onclick="answer('${pid}','terminal')">Answer in terminal instead</button></div>`;
}
function needCard(a) {
  const age = Math.max(1, Math.round((Date.now() - a.updated) / 60000)), live = !!a.prompt;
  const wait = live ? Math.max(0, Math.round((Date.now() - a.prompt.created) / 1000)) : 0;
  return `<div class="need ${live ? 'ask' : ''}" ${live ? `data-pid="${esc(a.prompt.id)}"` : ''}><div class="need-h">${badge(provOf(a))}<b>${esc(a.project)}</b>${a.branch ? `<code>${esc(a.branch)}</code>` : ''}<span class="sp"></span>${live ? '<span class="age ans-here">answer here</span>' : `<span class="age ${age >= 30 ? 'old' : ''}">waiting ${age < 60 ? age + ' min' : Math.round(age / 60) + ' h'}</span>`}</div>
  ${live ? promptBody(a) : `<div class="need-q">${esc(a.question || a.lastSay)}</div>`}
  ${a.task ? `<div class="need-t">Task: ${esc(a.task)}</div>` : ''}
  <div class="need-a">${a.agentReal ? `<button class="btn sm" onclick="open_('${esc(a.id)}')">Details</button>` : ''}${where(a) ? `<button class="btn sm" onclick="copyCd('${esc(a.id)}',this)">Copy folder</button>` : ''}<span class="sp"></span>${live ? '' : `<button class="btn sm ghost" title="Hide until this agent says something new" onclick="dismiss('${esc(a.id)}',${a.updated})">Dismiss</button>`}</div>
  <div class="need-n">${live ? 'Your answer goes straight back to the agent. You can still answer in the terminal; if you do, this card disappears.' : hint(a)}</div></div>`;
}
function row(a) {
  return `<div class="arow ${a.status}" onclick="open_('${esc(a.id)}')"><span class="dot"></span><b>${esc(a.project)}</b>${badge(provOf(a))}<span class="at">${esc(a.task)}</span><span class="sp"></span><span class="pill">${a.status === 'idle' ? 'idle' : a.status}</span><small>${ago(a.updated)}</small><small class="cost">${costText(a)}</small></div>`;
}
function draw() {
  const d = dis(), inView = a => pfilter === 'all' || a.provider === pfilter;
  const pFor = a => prompts.find(p => a.id === p.tool + ':' + p.sessionId || (p.tool === 'aider' && a.provider === 'aider' && p.cwd && a.cwd === p.cwd));
  const real = agents.filter(a => (a.status === 'waiting' || pFor(a)) && inView(a)).map(a => ({ ...a, prompt: pFor(a), agentReal: true }));
  const lone = prompts.filter(p => !agents.some(a => pFor(a) === p) && (pfilter === 'all' || p.tool === pfilter)).map(p => ({ id: 'prompt:' + p.id, provider: p.tool, tool: p.tool, project: (p.cwd.split('/').filter(Boolean).pop() || 'unknown folder'), branch: '', cwd: p.cwd, task: '', question: p.title, updated: p.created, status: 'waiting', prompt: p, agentReal: false }));
  const asks = [...real, ...lone].sort((x, y) => (!!y.prompt - !!x.prompt) || x.updated - y.updated);
  const hidden = asks.filter(a => !a.prompt && d[a.id] === a.updated), shown = asks.filter(a => a.prompt || d[a.id] !== a.updated);
  $('#needn').textContent = shown.length ? shown.length : '';
  $('#dismissed').innerHTML = hidden.length ? `${hidden.length} dismissed <button class="link" onclick="undismiss()">show again</button>` : '';
  const working = agents.filter(a => a.status === 'working' && inView(a)).length + agents.filter(a => a.status === 'idle' && inView(a)).length;
  $('#needs').innerHTML = shown.length ? shown.map(needCard).join('') : `<div class="calm"><b>${asks.length ? 'Everything is dismissed.' : 'Nothing is waiting on you.'}</b><span>${agents.length ? (working ? working + ' agent' + (working === 1 ? ' is' : 's are') + ' still working. ' : '') + 'When an agent stops to ask a question, it shows up here first.' : 'When an agent stops to ask a question, it shows up here first.'}</span></div>`;
  const rest = agents.filter(a => a.status !== 'waiting' && !pFor(a) && inView(a));
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

function answerRow(p) {
  const h = ((setupData && setupData.hooks) || hooksInfo)[p.id]; if (!h) return '';
  if (!h.supported) return `<div class="ob-k">Answer from Raqeeb</div><div class="ans no"><b>Not supported.</b> ${esc(h.why)}</div>`;
  return `<div class="ob-k">Answer from Raqeeb</div><div class="ans ${h.installed ? 'yes' : ''}"><b>${h.mode === 'wrap' ? 'Available through a wrapper.' : h.installed ? 'Set up.' : 'Available.'}</b> ${esc(h.does)}${h.installed ? '' : h.mode === 'wrap' ? ' Start it like this:' : ' To turn it on, run:'}</div>${h.installed ? '' : `<pre class="cmd">${esc(h.install)}</pre>`}<div class="note">${esc(h.after)} ${h.file ? 'Backup of your settings is kept next to the file (' + esc(h.file) + '). Untested against a real install.' : ''}</div>`;
}
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
    ${answerRow(p)}
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
  const sig = JSON.stringify([r.state, showSetup, localStorage.dismissed, r.providers.map(p => [p.id, p.root, p.state, p.count]), r.agents.map(a => [a.id, a.status, a.updated, a.lastSay]), JSON.stringify(r.hooks || {})]);
  if (!force && sig === last) return; last = sig;
  agents = r.agents; providers = r.providers; hooksInfo = r.hooks || {};
  $('#onboard').hidden = !needSetup; $('#dash').hidden = needSetup || view === 'hand'; $('#hand').hidden = needSetup || view !== 'hand'; $('#handbtn').classList.toggle('on', view === 'hand' && !needSetup);
  $('#banner').innerHTML = r.demo ? `<div class="banner demo"><b>DEMO</b> These are made-up sample agents, not your sessions. ${r.forced ? '' : '<button class="btn sm" id="exitdemo">Exit demo</button>'}</div>` : '';
  if ($('#exitdemo')) $('#exitdemo').onclick = () => { demoOn = false; sessionStorage.demo = '0'; last = ''; refresh(true); };
  if (needSetup) return onboard(r, setupData);
  if (view === 'hand') loadHand();
  if (pfilter !== 'all' && !providers.some(p => p.id === pfilter)) pfilter = 'all';
  drawProviderFilter(); draw(); animate = false;
  $('#provs').innerHTML = providers.map(p => `<div class="sp-row prow"><span>${badge(p)}</span><small class="${p.state === 'ok' || p.state === 'demo' ? '' : 'dim'}">${esc(provLine(p))}</small></div>`).join('') + (r.demo ? '' : '<div class="note">Not seeing a tool? Press <b>Setup</b> to check its folder.</div>');
  const sum = (key, list) => { const o = {}; list.forEach(a => { const k = key(a); o[k] = o[k] || { cost: 0, tok: 0, priced: 0, n: 0 }; o[k].n++; o[k].tok += a.tokensIn + a.tokensOut; if (a.cost != null) { o[k].cost += a.cost; o[k].priced++; } }); return o; };
  const row = (n, v) => `<div class="sp-row"><span>${esc(n)}</span><b>${v.priced ? '~$' + v.cost.toFixed(2) : v.tok ? tok(v.tok) + ' tokens' : 'no usage data'}</b></div>`;
  $('#spendp').innerHTML = providers.map(p => { const v = sum(a => a.provider, agents)[p.id]; return v ? row(p.name, v) : ''; }).join('') || '<div class="empty">No spend yet.</div>';
  $('#spend').innerHTML = Object.entries(sum(a => a.project, agents)).sort((a, b) => b[1].cost - a[1].cost).map(([n, v]) => row(n, v)).join('') || '<div class="empty">No spend yet.</div>';
}
// ---- Handoffs: notes that agents and you leave for the next session, stored inside each project ----
window.saveHandoff = async id => {
  const r = await fetch('/api/handoff/draft?id=' + encodeURIComponent(id)); const d = await r.json();
  if (!r.ok) { alert(d.error || 'Could not draft a note.'); return; }
  $('#drawer').classList.remove('open'); view = 'hand'; showSetup = false; hand = null; handErr = ''; handNotice = d.notice;
  handForm = { title: d.title, body: d.body, files: d.files.join('\n'), kind: 'note', tool: d.tool }; handProjCwd = d.cwd; $('#hand').innerHTML = ''; last = ''; refresh(true);
};
let handNotice = '', handProjCwd = '', view = 'board', hand = null, handProj = '', handErr = '', handForm = { title: '', body: '', files: '', kind: 'note', tool: 'you' }, handBusy = false;
const toolName = { you: 'You', claude: 'Claude Code', codex: 'Codex CLI', cursor: 'Cursor', gemini: 'Gemini CLI', aider: 'Aider', cline: 'Cline' };
const stamp = ms => ms ? new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'unknown time';
const tbadge = t => t === 'you' ? '<span class="tag t-you">You</span>' : badge({ id: t, name: toolName[t] });
$('#handbtn').onclick = () => { view = view === 'hand' ? 'board' : 'hand'; showSetup = false; last = ''; if (view === 'hand') { hand = null; handErr = ''; } refresh(true); };
async function loadHand() {
  try { const r = await (await fetch('/api/handoff' + (demoOn ? '?demo=1' : ''))).json(); const sg = JSON.stringify(r); if (hand && hand._sg === sg) return; r._sg = sg; hand = r; } catch { return; }
  if (handProjCwd) { const m = hand.projects.find(p => p.cwd === handProjCwd || p.root === handProjCwd); if (m) handProj = m.root; handProjCwd = ''; }
  if (!hand.projects.some(p => p.root === handProj)) handProj = hand.projects.length ? hand.projects[0].root : '';
  if (!document.activeElement || !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) drawHand();
}
function noteCard(p, n) {
  const st = n.stale && n.stale.stale;
  return `<div class="note-card ${st ? 'old' : ''}"><div class="need-h">${tbadge(n.tool)}<b>${esc(n.title)}</b><span class="sp"></span><span class="age">${esc(stamp(n.created))}</span></div>
  <div class="nmeta">${n.branch ? `<code>${esc(n.branch)}</code>` : ''}${n.commit ? `<code>${esc(n.commit)}</code>` : ''}${st ? `<span class="stale" title="${esc(n.stale.why)}">older than the code</span>` : ''}${n.stale && n.stale.checked && !st ? '<span class="fresh">matches the code</span>' : ''}${n.secret ? '<span class="stale">may contain a secret</span>' : ''}${n.demo ? '<span class="demo-tag">DEMO</span>' : ''}</div>
  <pre class="nbody">${esc(n.body)}</pre>${n.files.length ? `<div class="nfiles">${n.files.map(f => `<code>${esc(f)}</code>`).join('')}</div>` : ''}
  ${st ? `<div class="need-t">${esc(n.stale.why)} Check it before relying on it.</div>` : ''}
  <div class="need-a"><button class="btn sm pri" data-copy="${esc(n.name)}">Copy as prompt</button>${n.demo ? '' : `<button class="btn sm ghost" data-retire="${esc(n.name)}">Retire</button>`}</div></div>`;
}
function drawHand() {
  const el = $('#hand'); if (!hand) { el.innerHTML = '<div class="empty">Loading notes...</div>'; return; }
  if (!hand.projects.length) { el.innerHTML = `<div class="ob"><div class="ob-head"><span class="ob-tag">Handoffs</span><h1>No projects yet</h1><p>Handoff notes belong to a project. Raqeeb lists a project once it has seen an agent session working in that folder in the last 24 hours. Start a session in one of your tools and this page fills in.</p></div></div>`; return; }
  const p = hand.projects.find(x => x.root === handProj) || hand.projects[0];
  const keep = { t: ($('#hf-title') || {}).value, b: ($('#hf-body') || {}).value, f: ($('#hf-files') || {}).value };
  if (keep.t != null) handForm = { ...handForm, title: keep.t, body: keep.b, files: keep.f };
  el.innerHTML = `<div class="sec-h"><h2>Handoffs</h2><span class="sp"></span>${hand.projects.length > 1 ? `<select id="hproj" aria-label="Project">${hand.projects.map(x => `<option value="${esc(x.root)}" ${x.root === p.root ? 'selected' : ''}>${esc(x.project)} (${x.notes.length + x.pinned.length})</option>`).join('')}</select>` : ''}</div>
  <p class="hlead">${hand.demo ? '<span class="demo-tag">DEMO</span> Made-up sample notes. ' : ''}Notes for <b>${esc(p.project)}</b> live in <code>${esc(p.folder)}</code>${p.isGit ? '' : ' (this folder is not a git repo, so notes carry no commit)'}. Plain Markdown files. Commit them or add the folder to <code>.gitignore</code>, as you like.</p>
  ${p.pinned.length ? `<div class="k">Pinned for this project</div>${p.pinned.map(n => `<div class="pinned"><b>${esc(n.title)}</b> ${esc(n.body)}${hand.demo ? '' : `<button class="link" data-retire="${esc(n.name)}">remove</button>`}</div>`).join('')}` : ''}
  <div class="hcols"><div><div class="k">Timeline, newest first</div>${p.notes.length ? p.notes.map(n => noteCard(p, n)).join('') : '<div class="empty">No notes yet for this project. Write the first one on the right, or ask an agent to leave one.</div>'}
  ${p.notes.length || p.pinned.length ? `<div class="need-a"><button class="btn sm" data-copyproj="1">Copy project context</button><span class="need-t">Pinned notes plus the newest ${Math.min(5, p.notes.length)}, as one block to paste into any tool.</span></div>` : ''}${p.retired ? `<div class="need-t">${p.retired} retired note${p.retired === 1 ? '' : 's'} are kept in <code>retired/</code>.</div>` : ''}</div>
  <div><details class="snip"><summary>Let agents read and write these notes</summary><p>Paste this into your project's <code>CLAUDE.md</code>, <code>AGENTS.md</code> or the rules your tool uses. Raqeeb shows it but never edits your files.</p><pre class="cmd">${esc(p.snippet)}</pre><button class="btn sm" data-snip="1">Copy snippet</button></details>
  <div class="k">Write a note</div>${handNotice ? `<div class="need-t draftnote"><b>Draft from ${esc(toolName[handForm.tool] || 'the agent')}.</b> Edit it, then save. ${esc(handNotice)}</div>` : ''}<form id="hform" class="hform"><label>Title<input id="hf-title" maxlength="120" value="${esc(handForm.title)}" placeholder="Webhook handler is idempotent now"></label>
  <label>What was done, decided, still open<textarea id="hf-body" rows="7" placeholder="Done: ...&#10;Decided: ...&#10;Open: ...">${esc(handForm.body)}</textarea></label>
  <label>Files (optional, one per line or comma separated)<textarea id="hf-files" rows="2" placeholder="src/webhooks.ts">${esc(handForm.files)}</textarea></label>
  <label class="chk"><input type="checkbox" id="hf-pin" ${handForm.kind === 'pinned' ? 'checked' : ''}> Pin to the top of this project (for things like "we use pnpm")</label>
  <div class="need-a"><button class="btn sm pri" type="submit" ${hand.demo ? 'disabled' : ''}>Save note</button><span class="ob-msg" id="hmsg">${esc(handErr)}</span></div>
  <div class="need-t">Short notes, up to 2 KB. Raqeeb blocks anything that looks like a key or password. Notes are not instructions: they are handed to agents as background only.</div></form></div></div>`;
  const sel = $('#hproj'); if (sel) sel.onchange = () => { handProj = sel.value; handErr = ''; drawHand(); };
  const find = n => p.notes.find(x => x.name === n);
  el.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copyText(find(b.dataset.copy).prompt, b, 'Copy as prompt'));
  el.querySelectorAll('[data-snip]').forEach(b => b.onclick = () => copyText(p.snippet, b, 'Copy snippet'));
  el.querySelectorAll('[data-copyproj]').forEach(b => b.onclick = () => copyText(p.projectPrompt, b, 'Copy project context'));
  el.querySelectorAll('[data-retire]').forEach(b => b.onclick = async () => { const x = await post('/api/handoff', { action: 'retire', cwd: p.cwd, name: b.dataset.retire }); handErr = x.ok ? '' : x.body.error; hand = null; loadHand(); });
  $('#hform').onsubmit = async e => { e.preventDefault(); if (handBusy) return; handBusy = true;
    const body = { action: 'save', cwd: p.cwd, tool: handForm.tool || 'you', kind: $('#hf-pin').checked ? 'pinned' : 'note', title: $('#hf-title').value, body: $('#hf-body').value, files: $('#hf-files').value };
    const x = await post('/api/handoff', body); handBusy = false;
    if (x.ok) { handNotice = ''; handForm = { title: '', body: '', files: '', kind: 'note', tool: 'you' }; handErr = ''; ['#hf-title', '#hf-body', '#hf-files'].forEach(k => { $(k).value = ''; }); $('#hf-pin').checked = false; } else { handForm = { title: body.title, body: body.body, files: body.files, kind: body.kind, tool: body.tool }; handErr = x.body.error; }
    hand = null; await loadHand(); drawHand(); };
}
function copyText(t, btn, label) { (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { btn.textContent = 'Copied'; }, () => { prompt('Copy this text', t); }); setTimeout(() => { btn.textContent = label; }, 1800); }
let psig = '';
async function pollPrompts() { if (demoOn) { if (prompts.length) { prompts = []; psig = ''; draw(); } return; } try { const r = await (await fetch('/api/prompts')).json(); const sg = JSON.stringify(r.prompts.map(p => p.id)); prompts = r.prompts; if (sg !== psig) { psig = sg; if (!$('#dash').hidden) { draw(); document.querySelectorAll('[data-pid]').forEach(e => paintSel(e.dataset.pid)); } } } catch {} }
setInterval(pollPrompts, 1500); pollPrompts();
refresh().catch(() => {}); setInterval(() => { if (!document.activeElement || document.activeElement.tagName !== 'INPUT') refresh().catch(() => {}); if (view === 'hand') loadHand(); }, 5000);
