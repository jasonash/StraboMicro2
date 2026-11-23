/**
 * A mineral's amount in a list (src/utils/mineralAmount.ts): null and 0 are
 * no amount (the dialog saved 0 for "none" for a year); operators show as
 * symbols, never as "eq".
 *
 *   npm run test:mineral-amount
 */

import { mineralAmountText, mineralHasAmount, operatorSymbol } from '../src/utils/mineralAmount.ts';

let failures = 0;
let passes = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        got      ${JSON.stringify(actual)}\n        expected ${JSON.stringify(expected)}`);
  }
}

eq('= 30%', mineralAmountText({ operator: 'eq', percentage: 30 }), '= 30%');
eq('> 5%', mineralAmountText({ operator: 'gt', percentage: 5 }), '> 5%');
eq('< 0.5%', mineralAmountText({ operator: 'lt', percentage: 0.5 }), '< 0.5%');
eq('symbol stored as is', mineralAmountText({ operator: '>', percentage: 12 }), '> 12%');
eq('no operator: just the number', mineralAmountText({ operator: null, percentage: 40 }), '40%');
eq('unknown operator: just the number', mineralAmountText({ operator: 'about', percentage: 40 }), '40%');
eq('legacy no amount (null)', mineralAmountText({ operator: 'eq', percentage: null }), '');
eq('missing fields', mineralAmountText({}), '');
eq('added without a percentage (operator \'\', 0)', mineralAmountText({ operator: '', percentage: 0 }), '');
eq('re-saved without a percentage (eq, 0): the bug', mineralAmountText({ operator: 'eq', percentage: 0 }), '');
eq('NaN', mineralAmountText({ operator: 'eq', percentage: Number.NaN }), '');
eq('over 100 (legacy) still shown', mineralAmountText({ operator: 'eq', percentage: 120 }), '= 120%');
eq('has amount 30', mineralHasAmount({ percentage: 30 }), true);
eq('has amount 0', mineralHasAmount({ percentage: 0 }), false);
eq('symbol eq', operatorSymbol('eq'), '=');
eq('symbol empty', operatorSymbol(''), '');

console.log(`mineralAmount: ${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
