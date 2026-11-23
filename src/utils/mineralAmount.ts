/**
 * A mineral's amount ("= 30%", "> 5%", "< 1%") in a mineral list.
 *
 * No amount is stored as percentage null (as the legacy app does). A stored
 * 0 also means no amount: from 2025-11-22 to 2026-11-23 the Mineralogy/
 * Lithology dialog saved a mineral entered without a percentage as 0
 * (operator '' when added, "eq" after any later Save), and a mineral listed
 * at 0% says nothing (Jason, 2026-11-23).
 *
 *   npm run test:mineral-amount
 */

export interface MineralAmountFields {
  operator?: string | null;
  percentage?: number | null;
}

const SYMBOLS: Record<string, string> = { eq: '=', gt: '>', lt: '<', '=': '=', '>': '>', '<': '<' };

/** The operator's symbol ("=", ">", "<"), or '' when there is none or it is unknown */
export function operatorSymbol(operator: string | null | undefined): string {
  return operator ? SYMBOLS[operator] ?? '' : '';
}

/** Whether the mineral has an amount (a number other than 0) */
export function mineralHasAmount(m: MineralAmountFields): boolean {
  return typeof m.percentage === 'number' && Number.isFinite(m.percentage) && m.percentage !== 0;
}

/** "= 30%" (or "30%" with no operator), '' when there is no amount */
export function mineralAmountText(m: MineralAmountFields): string {
  if (!mineralHasAmount(m)) return '';
  const symbol = operatorSymbol(m.operator);
  return symbol ? `${symbol} ${m.percentage}%` : `${m.percentage}%`;
}
