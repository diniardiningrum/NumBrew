import {
  INGREDIENTS,
  PRODUCTS,
  ingredientIds,
  type IngredientId,
  type ProductId,
} from '../../data/catalog';
import type { CostLine, Inventory } from '../types';
import { integer, ratio } from '../economy/money';

export function emptyInventory(): Inventory {
  return { matcha: [], coffee: [], cocoa: [], milk: [], cup: [] };
}
export function stock(inventory: Inventory, id: IngredientId): number {
  return inventory[id].reduce((total, batch) => total + batch.quantity - batch.consumed, 0);
}
export function inventoryValue(inventory: Inventory): number {
  return ingredientIds.reduce(
    (total, id) =>
      total + inventory[id].reduce((n, b) => n + b.cost - ratio(b.cost, b.consumed, b.quantity), 0),
    0,
  );
}
export function capacity(inventory: Inventory, product: ProductId): number {
  return Math.min(
    ...Object.entries(PRODUCTS[product].recipe).map(([id, qty]) =>
      Math.floor(stock(inventory, id as IngredientId) / qty),
    ),
  );
}
export function consume(inventory: Inventory, id: IngredientId, quantity: number): number {
  integer(quantity);
  if (stock(inventory, id) < quantity)
    throw new Error(`Not enough stock of ${INGREDIENTS[id].name.toLowerCase()}.`);
  let remaining = quantity,
    cost = 0;
  for (const batch of inventory[id]) {
    const used = Math.min(remaining, batch.quantity - batch.consumed);
    cost +=
      ratio(batch.cost, batch.consumed + used, batch.quantity) -
      ratio(batch.cost, batch.consumed, batch.quantity);
    batch.consumed += used;
    remaining -= used;
    if (!remaining) break;
  }
  return cost;
}
export function recipeCost(
  inventory: Inventory,
  product: ProductId,
): { hpp: number; lines: CostLine[]; estimated: boolean } {
  const clone = structuredClone(inventory);
  const estimated = capacity(inventory, product) < 1;
  const lines = Object.entries(PRODUCTS[product].recipe).map(([key, quantity]) => {
    const ingredient = key as IngredientId;
    const cost = estimated
      ? ratio(INGREDIENTS[ingredient].cost, quantity, INGREDIENTS[ingredient].pack)
      : consume(clone, ingredient, quantity);
    return { ingredient, quantity, cost };
  });
  return { hpp: lines.reduce((sum, l) => sum + l.cost, 0), lines, estimated };
}
