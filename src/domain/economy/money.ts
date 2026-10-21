export function integer(value: number, label = 'Value', max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > max)
    throw new Error(`${label} is invalid.`);
  return value;
}

export function ratio(amount: number, numerator: number, denominator: number): number {
  integer(amount);
  integer(numerator);
  integer(denominator);
  if (denominator === 0) throw new Error('The divisor must be greater than zero.');
  const product = integer(amount * numerator);
  const quotient = Math.floor(product / denominator);
  return quotient + (product % denominator >= Math.ceil(denominator / 2) ? 1 : 0);
}

export function percentage(profit: number, cost: number): number | null {
  return cost > 0 ? Math.round((profit / cost) * 10_000) / 100 : null;
}
