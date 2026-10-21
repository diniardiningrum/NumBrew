import type { ProductId } from '../../data/catalog';
import type { Session } from '../types';
import { recipeCost } from '../inventory/inventory';

/** Accept integer Rupiah, with optional Indonesian thousands separators. */
export function parseHppInput(input: string): number | null {
  const text = input.trim();
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(text)) return null;
  const value = Number(text.replaceAll('.', ''));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function hasCalculatedHpp(session: Session, product: ProductId): boolean {
  return session.menu[product].calculatedHpp === recipeCost(session.inventory, product).hpp;
}

export function hppFeedback(answer: number, expected: number): string | null {
  if (!Number.isSafeInteger(answer) || answer <= 0)
    return 'Enter a whole Rupiah total, for example 5000 or 5.000.';
  if (answer < expected)
    return 'Your total is too low. Add all ingredient costs per serving, including the cup & lid.';
  if (answer > expected)
    return 'Your total is too high. Add the costs per serving on the right, not the price of each whole pack.';
  return null;
}
