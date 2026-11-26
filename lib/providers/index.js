'use strict';
// Registry of provider adapters. To add an agent, create a file here that exports the adapter shape
// (see CONTRIBUTING.md) and add it to this list.
const list = [require('./claude'), require('./codex'), require('./cursor')];
const byId = Object.fromEntries(list.map(p => [p.id, p]));
module.exports = { list, byId };
