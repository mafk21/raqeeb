const $ = s => document.querySelector(s), root = document.documentElement;
root.dataset.theme = (location.hash == '#dark' ? 'dark' : null) || localStorage.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
$('#theme').onclick = () => { root.dataset.theme = localStorage.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ago = ms => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; };
const cost = a => (a.tokensIn * 3 + a.tokensOut * 15) / 1e6;
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
async function load() {
  const r = await (await fetch('/api/agents')).json(); const sig = JSON.stringify(r.agents.map(a => [a.id, a.status, a.updated, a.lastSay])); if (sig === last) return; last = sig; agents = r.agents;
  $('#banner').innerHTML = r.demo ? '<div class="banner">Showing demo data. Start a Claude Code session and your real agents appear here.</div>' : '';
  const c = s => agents.filter(a => a.status === s).length;
  $('#stats').innerHTML = [['', c('working') + c('idle'), 'Working'], ['hot', c('waiting'), 'Waiting on you'], ['', c('done'), 'Done'], ['amb', '$' + agents.reduce((s, a) => s + cost(a), 0).toFixed(2), 'Est. spend']].map(([k, n, l]) => `<div class="kpi ${k}"><small>${l}</small><b>${n}</b></div>`).join('');
  draw(); animate = false;
  const qs = agents.filter(a => a.question);
  $('#inbox').innerHTML = qs.length ? qs.map(a => `<div class="q"><small>${esc(a.project)} · ${ago(a.updated)}</small><div>${esc(a.question)}</div></div>`).join('') : '<div class="empty">No agent is waiting on you.</div>';
}
load(); setInterval(load, 5000);
