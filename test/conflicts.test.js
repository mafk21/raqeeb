'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const h = require('./helpers');
const { annotate } = require('../lib/conflicts');
const sh = (cwd, ...a) => cp.execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, stdio: 'ignore' });
const mk = (id, cwd, status, ageMin) => ({ id, tool: id, cwd, status, updated: Date.now() - ageMin * 60000 });
test('two active sessions in one repo (even different subfolders) are flagged; others are not', () => {
  const d = fs.realpathSync(h.tmp('raqeeb-c-')); sh(d, 'init', '-q'); fs.mkdirSync(d + '/sub'); const other = h.tmp('raqeeb-c2-');
  const a = [mk('claude', d, 'working', 1), mk('codex', d + '/sub', 'waiting', 5), mk('gemini', d, 'done', 2), mk('aider', d, 'idle', 90), mk('cline', other, 'working', 1), mk('cursor', '', 'working', 1)];
  annotate(a);
  assert.deepEqual(a[0].conflict.map(c => c.id), ['codex']); assert.deepEqual(a[1].conflict.map(c => c.id), ['claude']);
  for (const i of [2, 3, 4, 5]) assert.deepEqual(a[i].conflict, [], a[i].id);
});
test('a git worktree has its own root, so it is not flagged', () => {
  const d = fs.realpathSync(h.tmp('raqeeb-c-')); sh(d, 'init', '-q', '-b', 'main'); fs.writeFileSync(d + '/f', '1'); sh(d, 'add', '-A'); sh(d, 'commit', '-qm', 'x');
  const wt = d + '-wt'; sh(d, 'worktree', 'add', '-q', '-b', 'feat', wt);
  const a = [mk('claude', d, 'working', 1), mk('codex', fs.realpathSync(wt), 'working', 1)]; annotate(a);
  assert.deepEqual(a.map(x => x.conflict.length), [0, 0]);
});
