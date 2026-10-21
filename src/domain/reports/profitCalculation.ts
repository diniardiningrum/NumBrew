import type { Report } from '../types';

/** Signed integer Rupiah: negative is a loss, zero is break-even. */
export function parseProfitInput(input: string): number | null {
  const text = input.trim();
  if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(text)) return null;
  const value = Number(text.replaceAll('.', ''));
  return Number.isSafeInteger(value) ? value : null;
}

export function profitFeedback(answer: number | null, expected: number): string | null {
  if (answer === null || !Number.isSafeInteger(answer))
    return 'Enter whole Rupiah. Use a minus sign for a loss, such as -5000 or -5.000. Enter 0 for break-even.';
  if (answer === expected) return null;
  if (expected < 0 && answer > 0 && answer === -expected)
    return 'The difference is correct. Since costs exceed revenue, write your answer with a minus sign.';
  return 'Not quite. Start with net revenue, then subtract COGS, operating costs, and tax. Do not subtract discounts twice or deduct all stock purchases.';
}

export function hasCalculatedProfit(report: Report): boolean {
  return report.calculatedProfit === report.profit;
}

/** Reset a running calculation whenever its underlying business figures change. */
export function profitBasis(report: Report): string {
  return [report.day, report.netRevenue, report.hpp, report.operating, report.tax].join(':');
}
