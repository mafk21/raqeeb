const $ = s => document.querySelector(s), root = document.documentElement;
root.dataset.theme = (location.hash == '#dark' ? 'dark' : null) || localStorage.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
$('#theme').onclick = () => { root.dataset.theme = localStorage.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ago = ms => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; };
const cost = a => a.cost != null ? a.cost : (a.tokensIn * 3 + a.tokensOut * 15) / 1e6;
let agents = [], filter = 'all', last = '', animate = true;
const bucket = a => a.status === 'idle' ? 'working' : a.status;
document.querySelectorAll('#seg button').forEach(b => b.onclick = () => { filter = b.dataset.f; document.querySelectorAll('#seg button').forEach(x => x.classList.toggle('on', x === b)); draw(); });
$('#drawer').onclick = e => { if (e.target.id === 'drawer') $('#drawer').classList.remove('open'); };
function open(id) { const a = agents.find(x => x.id === id); if (!a) return;
  $('#panel').innerHTML = `<h3>${esc(a.project)}</h3><div class="meta">${esc(a.tool)} · ${esc(a.branch || 'no branch')} · ${esc(a.model || '')}</div><span class="pill" style="display:inline-block">${a.status}</span>
  <div class="k">Task</div><pre>${esc(a.task)}</pre><div class="k">Last message</div><pre>${esc(a.lastSay)}</pre>${a.question ? `<div class="k">Waiting on you</div><pre>${esc(a.question)}</pre>` : ''}
  <div class="k">Usage</div><pre>${a.tokensIn.toLocaleString()} tokens in, ${a.tokensOut.toLocaleString()} out\nEstimated cost ~$${cost(a).toFixed(2)}\nWorking directory: ${esc(a.cwd)}</pre><p><button class="btn" onclick="document.getElementById('drawer').classList.remove('open')">Close</button></p>`;
  $('#drawer').classList.add('open'); }
function draw() {
  const list = agents.filter(a => filter === 'all' || bucket(a) === filter);
  $('#board').innerHTML = list.map((a, i) => `<div class="card ${a.status}" style="${animate ? `animation:up .5s ${i * 50}ms both` : 'animation:none'}" onclick="open_('${a.id}')"><div class="row"><span class="proj">${esc(a.project)}</span><span class="pill">${a.status}</span></div>
  <div class="meta">${esc(a.tool)} · ${esc(a.branch || 'no branch')}</div><div class="task">${esc(a.task)}</div><div class="say">${esc(a.lastSay)}</div>
  <div class="foot"><span>${ago(a.updated)}</span><span>~$${cost(a).toFixed(2)}</span></div></div>`).join('') || '<div class="empty">No agents in this view.</div>';
}
window.open_ = open;
let demoOn = sessionStorage.demo === '1', showSetup = false, setupData = null;
const mono = s => `<code>${esc(s)}</code>`;
async function post(url, body) { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { ok: r.ok, body: await r.json() }; }

function onboard(r, setup) {
  const info = (setup && setup.info) || r.info || {}, root = (setup && setup.root) || r.root || '';
  const found = info.exists && info.isDir, hasOld = found && info.files > 0;
  const cands = (setup ? setup.candidates : []).filter(c => c.exists && c.isDir);
  const ok = r.state === 'ok';
  const headline = ok ? 'Sessions folder' : !found ? 'Raqeeb could not find your Claude Code sessions'
    : hasOld ? 'No Claude Code sessions in the last 24 hours' : 'No Claude Code sessions found yet';
  const detail = ok ? `Raqeeb is reading ${info.recent} recent session${info.recent === 1 ? '' : 's'} (of ${info.files}) from ${mono(root)}.` : !found ? `There is no folder at ${mono(root)}.`
    : hasOld ? `The folder ${mono(root)} has ${info.files} older session file${info.files === 1 ? '' : 's'}, but none were touched in the last 24 hours.`
    : `The folder ${mono(root)} exists but has no session files in it yet.`;
  const first = !setup || !setup.configured;
  $('#onboard').innerHTML = `<div class="ob">
    <div class="ob-head"><span class="ob-tag">${ok ? 'Setup' : found ? 'Nothing to show yet' : 'First run'}</span><h1>${headline}</h1><p>${detail} ${ok ? '' : 'No sample data is shown. '}Everything on this page comes from your own session files.</p></div>
    <div class="ob-grid">
      <div class="ob-step"><b>1</b><h3>Confirm the sessions folder</h3>
        <p>Claude Code writes one log file per session. Raqeeb reads them, read-only, from this folder:</p>
        <form id="dirform"><input id="dirin" value="${esc(root)}" spellcheck="false" aria-label="Claude Code projects folder"><div class="ob-row"><button class="btn pri" type="submit">Save and scan</button><button class="btn" type="button" id="resetdir">Use default</button></div></form>
        <div id="dirmsg" class="ob-msg">${setup && setup.locked ? 'This run was started with --dir, so the folder is fixed.' : ''}</div>
        ${cands.length ? `<div class="ob-k">Folders found on this computer</div>${cands.map(c => `<button class="cand" data-p="${esc(c.path)}"><span>${esc(c.path)}</span><em>${c.files} session file${c.files === 1 ? '' : 's'}</em></button>`).join('')}` : `<div class="ob-k">No Claude Code folder was found in the usual places. If you use Claude Code, run it once in a project, then press Re-scan.</div>`}
      </div>
      <div class="ob-step"><b>2</b><h3>Start a Claude Code session</h3>
        <p>Open a terminal in any project and start Claude Code:</p><pre class="cmd">cd your-project\nclaude</pre>
        <p>Send it a message. Within a few seconds its session shows up here. Leave this page open, it refreshes on its own.</p></div>
      <div class="ob-step"><b>3</b><h3>Check again</h3>
        <p>Once a session exists, press the button. Or just wait, Raqeeb re-scans every 5 seconds.</p>
        <button class="btn pri" id="rescan">Re-scan now</button><div id="scanmsg" class="ob-msg"></div>
        <div class="ob-k">Just want to look around?</div><button class="btn" id="trydemo">Try demo with sample data</button></div>
    </div></div>`;
  $('#dirform').onsubmit = async e => { e.preventDefault(); const m = $('#dirmsg'); m.textContent = 'Checking...'; const x = await post('/api/setup', { dir: $('#dirin').value }); m.textContent = x.ok ? '' : x.body.error; if (x.ok) { setupData = null; last = ''; await refresh(true); } };
  $('#resetdir').onclick = async () => { await post('/api/setup', { dir: '' }); setupData = null; last = ''; await refresh(true); };
  document.querySelectorAll('.cand').forEach(b => b.onclick = async () => { await post('/api/setup', { dir: b.dataset.p }); setupData = null; last = ''; await refresh(true); });
  $('#rescan').onclick = async () => { $('#scanmsg').textContent = 'Scanning...'; last = ''; await refresh(true); const n = $('#scanmsg'); if (n) n.textContent = 'Scanned just now. Still nothing found.'; };
  $('#trydemo').onclick = () => { demoOn = true; sessionStorage.demo = '1'; last = ''; refresh(true); };
}
$('#setupbtn').onclick = () => { showSetup = !showSetup; last = ''; refresh(true); };

async function refresh(force) {
  const r = await (await fetch('/api/agents' + (demoOn ? '?demo=1' : ''))).json();
  const explicitDemo = r.demo;
  const needSetup = !explicitDemo && (r.state !== 'ok' || showSetup);
  if (needSetup && !setupData) setupData = await (await fetch('/api/setup')).json();
  if (!needSetup) setupData = null;
  const sig = JSON.stringify([r.state, showSetup, r.root, r.info, r.agents.map(a => [a.id, a.status, a.updated, a.lastSay])]);
  if (!force && sig === last) return; last = sig;
  $('#onboard').hidden = !needSetup; $('#dash').hidden = needSetup;
  $('#banner').innerHTML = explicitDemo ? `<div class="banner demo"><b>DEMO</b> These are made-up sample agents, not your sessions. ${r.forced ? '' : '<button class="btn sm" id="exitdemo">Exit demo</button>'}</div>` : '';
  if ($('#exitdemo')) $('#exitdemo').onclick = () => { demoOn = false; sessionStorage.demo = '0'; last = ''; refresh(true); };
  if (needSetup) { onboard(r, setupData && { ...setupData, configured: !!setupData.root }); return; }
  agents = r.agents;
  const c = s => agents.filter(a => a.status === s).length;
  $('#stats').innerHTML = [['', c('working') + c('idle'), 'Working'], ['hot', c('waiting'), 'Waiting on you'], ['', c('done'), 'Done'], ['amb', '$' + agents.reduce((s, a) => s + cost(a), 0).toFixed(2), 'Est. spend']].map(([k, n, l]) => `<div class="kpi ${k}"><small>${l}</small><b>${n}</b></div>`).join('');
  draw(); animate = false;
  const qs = agents.filter(a => a.question);
  $('#inbox').innerHTML = qs.length ? qs.map(a => `<div class="q"><small>${esc(a.project)} · ${ago(a.updated)}</small><div>${esc(a.question)}</div></div>`).join('') : '<div class="empty">No agent is waiting on you.</div>';
  const byProj = {}; agents.forEach(a => byProj[a.project] = (byProj[a.project] || 0) + cost(a));
  $('#spend').innerHTML = Object.entries(byProj).sort((a, b) => b[1] - a[1]).map(([p, c]) => `<div class="sp-row"><span>${esc(p)}</span><b>~$${c.toFixed(2)}</b></div>`).join('') || '<div class="empty">No spend yet.</div>';
}
refresh().catch(() => {}); setInterval(() => { if (!document.activeElement || document.activeElement.id !== 'dirin') refresh().catch(() => {}); }, 5000);
