'use strict';
// Small settings file so the folder you confirm in the setup screen is remembered.
// Stored at ~/.raqeeb/config.json (override the folder with RAQEEB_HOME). Raqeeb never writes anywhere else.
const fs = require('fs'), path = require('path'), os = require('os');
const file = () => path.join(process.env.RAQEEB_HOME || path.join(os.homedir(), '.raqeeb'), 'config.json');
function load() { try { const c = JSON.parse(fs.readFileSync(file(), 'utf8')); return c && typeof c === 'object' ? c : {}; } catch { return {}; } }
function save(c) { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file(), JSON.stringify(c, null, 2)); }
module.exports = { load, save, file };
