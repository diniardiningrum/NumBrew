import { CONFIG } from '../../data/catalog';
import type { MenuItem } from '../types';
import { integer, ratio } from '../economy/money';

/** Round the discount once per cup; retain gross price for financial reporting. */
export function quotePrice(item: Pick<MenuItem, 'price' | 'discountPercent'>) {
  integer(item.price, 'Price', CONFIG.maxPrice);
  if (item.price < 1) throw new Error('Price must be greater than Rp0.');
  const discountPercent = integer(item.discountPercent ?? 0, 'Discount', CONFIG.maxDiscountPercent);
  // A paid order must retain at least Rp1 even at the minimum menu price.
  const discount = Math.min(item.price - 1, ratio(item.price, discountPercent, 100));
  return { gross: item.price, discountPercent, discount, net: item.price - discount };
}
