'use strict';
// Rough example rates in USD per million tokens: [input, output]. These are orientation only, not a bill.
// A model with no rate here has no cost estimate (shown as "tokens only"), never a made-up number.
// Add rates for your models, for example: [/gpt-5/i, [1.25, 10]]  (check your vendor's current price list first).
const RATES = [
  [/opus/i, [15, 75]],
  [/haiku/i, [1, 5]],
  [/sonnet/i, [3, 15]],
];
function rateFor(model) { const m = RATES.find(([re]) => re.test(model || '')); return m ? m[1] : null; }
// Returns dollars, or null when there is no rate for this model.
function costOf(model, tokensIn, tokensOut) {
  const r = rateFor(model);
  return r ? (tokensIn * r[0] + tokensOut * r[1]) / 1e6 : null;
}
module.exports = { costOf, rateFor, RATES };
