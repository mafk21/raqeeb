'use strict';
// Aider. Chat history is a Markdown file in each project: <repo>/.aider.chat.history.md, appended run after run.
// Each run starts with a "# aider chat started at <time>" heading. Your prompts are lines starting "#### ".
// Tool and status output is quoted with "> " (the model line, and a "Tokens: 1.2k sent, 340 received." line after each reply).
// There are no session ids and no structured records, so one history file is shown as one agent, using its latest run.
// Because history lives inside each repo there is no single folder: Raqeeb searches a projects folder (default: your home folder,
// 4 levels deep, skipping node_modules and hidden tool folders). Point it at your code folder on the setup screen to make it faster.
// Sources:
//   https://groundedby.com/agents/aider  (file names, heading, "#### " prompts, "> " tool output)
//   https://aider.chat/docs/config/options.html  (--chat-history-file default .aider.chat.history.md)
//   https://github.com/Aider-AI/aider/blob/main/aider/args.py  (default path in the git root)
// Experimental: the token line is the part I am least sure of. A custom --chat-history-file name is not found.
const fs = require('fs'), path = require('path'), os = require('os');
const { inspectFiles, makeScanner } = require('../common');

const NAME = '.aider.chat.history.md', TTL = 60000;
const isHist = n => n === NAME;
const defaultRoot = () => os.homedir();
const candidates = () => ['code', 'projects', 'dev', 'src', 'Developer', 'work', 'repos'].map(d => path.join(os.homedir(), d));
const num = s => { const m = /^([\d.,]+)\s*([kKmM])?$/.exec(String(s).trim()); if (!m) return 0; const n = parseFloat(m[1].replace(/,/g, '')); return Math.round(m[2] ? n * (/k/i.test(m[2]) ? 1e3 : 1e6) : n); };

function parse(file, st = fs.statSync(file)) {
  const text = fs.readFileSync(file, 'utf8'), at = text.lastIndexOf('# aider chat started at');
  const run = at >= 0 ? text.slice(at) : text;
  let task = '', lastSay = '', model = '', turns = 0, tIn = 0, tOut = 0, prompt = [], say = [], inPrompt = false;
  const flushSay = () => { const t = say.join('\n').trim(); if (t) lastSay = t; say = []; };
  for (const line of run.split('\n')) {
    if (line.startsWith('#### ')) {
      if (!inPrompt) { flushSay(); prompt = []; turns++; }
      inPrompt = true; prompt.push(line.slice(5)); if (!task) task = ''; continue;
    }
    if (inPrompt) { inPrompt = false; if (!task) task = prompt.join(' ').trim(); }
    if (line.startsWith('> ')) {
      const t = /Tokens:\s*([\d.,]+\s*[kKmM]?)\s*sent,\s*([\d.,]+\s*[kKmM]?)\s*received/.exec(line);
      if (t) { tIn += num(t[1]); tOut += num(t[2]); }
      const m = /^>\s*Model:\s*(\S+)/.exec(line); if (m) model = m[1];
      continue;
    }
    if (line.startsWith('# aider chat started')) continue;
    say.push(line);
  }
  if (inPrompt && !task) task = prompt.join(' ').trim();
  flushSay();
  const cwd = path.dirname(file);
  return {
    id: cwd, project: path.basename(cwd), cwd, branch: '', model, task: task.slice(0, 160), lastSay: lastSay.slice(-400),
    updated: st.mtimeMs, tokensIn: tIn, tokensOut: tOut, turns, cost: null, hasUsage: tIn + tOut > 0
  };
}

module.exports = {
  id: 'aider', name: 'Aider', experimental: true, start: 'cd your-project\naider',
  note: 'Looks for .aider.chat.history.md in your projects (default: whole home folder, 4 levels deep). Set it to your code folder to be faster. Experimental, from published notes. Tokens only, no price rate.',
  defaultRoot, candidates, parse,
  inspect: (root, now) => inspectFiles(root, 4, isHist, now, TTL),
  scan: makeScanner({ depth: 4, match: isHist, parse, ttl: TTL })
};
