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
    return 'Masukkan jumlah dalam rupiah bulat, misalnya 5000 atau 5.000.';
  if (answer < expected)
    return 'Jumlahmu terlalu kecil. Jumlahkan semua biaya bahan per porsi, termasuk gelas dan tutupnya.';
  if (answer > expected)
    return 'Jumlahmu terlalu besar. Jumlahkan biaya per porsi di sebelah kanan, bukan harga tiap kemasan penuh.';
  return null;
}
