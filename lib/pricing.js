'use strict';
// Rough example rates in USD per million tokens: [input, output]. These are estimates for
// orientation only, not a bill. Edit them here if your plan or the vendor prices change.
const RATES = [
  [/opus/i, [15, 75]],
  [/haiku/i, [1, 5]],
  [/sonnet/i, [3, 15]],
];
const DEFAULT = [3, 15];
function costOf(model, tokensIn, tokensOut) {
  const r = (RATES.find(([re]) => re.test(model || '')) || [null, DEFAULT])[1];
  return (tokensIn * r[0] + tokensOut * r[1]) / 1e6;
}
module.exports = { costOf, RATES };
