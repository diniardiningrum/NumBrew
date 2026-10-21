import { describe, expect, it } from 'vitest';
import { createSession, dispatchCommand } from '../../application/commands';
import { STARTER_CART, productIds } from '../../data/catalog';
import { hasCalculatedHpp, parseHppInput } from '../../domain/pricing/hpp';
import { recipeCost } from '../../domain/inventory/inventory';
import { decode, validSession } from '../../infrastructure/persistence/save';

function stocked() {
  return dispatchCommand(createSession(123, 'hpp-test'), { type: 'buy', cart: STARTER_CART }).state;
}

describe('player-calculated COGS', () => {
  it.each([
    ['6300', 6300],
    ['6.300', 6300],
    [' 6.300 ', 6300],
    ['123.456.789', 123456789],
  ])('accepts integer Rupiah input %s', (input, expected) =>
    expect(parseHppInput(String(input))).toBe(expected),
  );
  it.each([
    '',
    ' ',
    '-6300',
    '0',
    '6.3',
    '6,300',
    '1e4',
    'Infinity',
    'NaN',
    'Rp6300',
    '9007199254740992',
  ])('rejects ambiguous or invalid input %s', (input) => expect(parseHppInput(input)).toBeNull());
  it('blocks a price change until the player has calculated this recipe', () => {
    const initial = stocked();
    const blocked = dispatchCommand(initial, {
      type: 'price',
      product: 'matcha-latte',
      price: 12000,
    });
    expect(blocked.error).toBe(true);
    expect(blocked.state).toBe(initial);
    const calculated = dispatchCommand(initial, {
      type: 'calculate_hpp',
      product: 'matcha-latte',
      answer: 6300,
    });
    expect(calculated.error).toBeFalsy();
    expect(hasCalculatedHpp(calculated.state, 'matcha-latte')).toBe(true);
    expect(hasCalculatedHpp(calculated.state, 'coffee-latte')).toBe(false);
    expect(calculated.state.cash).toBe(initial.cash);
    expect(calculated.state.inventory).toEqual(initial.inventory);
    const price = dispatchCommand(calculated.state, {
      type: 'price',
      product: 'matcha-latte',
      price: 12000,
    });
    expect(price.error).toBeFalsy();
    expect(price.state.menu['matcha-latte'].price).toBe(12000);
  });
  it.each([5000, 7000, 0, -1, 6300.5, NaN, Infinity])(
    'rejects %s without penalties or revealing the total',
    (answer) => {
      const initial = stocked();
      const result = dispatchCommand(initial, {
        type: 'calculate_hpp',
        product: 'matcha-latte',
        answer,
      });
      expect(result.error).toBe(true);
      expect(result.state).toBe(initial);
      expect(result.message).not.toMatch(/6300|6\.300/);
    },
  );
  it('accepts each recipe independently and keeps engine costs authoritative', () => {
    let state = stocked();
    for (const product of productIds) {
      const expected = recipeCost(state.inventory, product).hpp;
      const result = dispatchCommand(state, { type: 'calculate_hpp', product, answer: expected });
      expect(result.error).toBeFalsy();
      state = result.state;
      expect(state.menu[product].calculatedHpp).toBe(expected);
    }
    const old = structuredClone(state.inventory);
    const repeat = dispatchCommand(state, {
      type: 'calculate_hpp',
      product: 'matcha-latte',
      answer: 6300,
    });
    expect(repeat.state.inventory).toEqual(old);
    expect(repeat.state.reputation).toBe(state.reputation);
    state.inventory.matcha[0].cost += 5000;
    expect(hasCalculatedHpp(state, 'matcha-latte')).toBe(false);
    expect(
      dispatchCommand(state, { type: 'price', product: 'matcha-latte', price: 12000 }).error,
    ).toBe(true);
    expect(recipeCost(state.inventory, 'matcha-latte').hpp).toBe(6400);
  });
  it('allows supplier estimates before buying and forbids edits once the cafe is open', () => {
    const estimated = dispatchCommand(createSession(), {
      type: 'calculate_hpp',
      product: 'cocoa-latte',
      answer: 6000,
    });
    expect(estimated.error).toBeFalsy();
    const open = dispatchCommand(stocked(), { type: 'open' }).state;
    expect(
      dispatchCommand(open, { type: 'calculate_hpp', product: 'cocoa-latte', answer: 6000 }).state,
    ).toBe(open);
  });
  it('persists completed work, accepts older saves, and rejects malformed calculations', () => {
    const initial = stocked();
    expect(validSession(initial)).toBe(true);
    const state = dispatchCommand(initial, {
      type: 'calculate_hpp',
      product: 'matcha-latte',
      answer: 6300,
    }).state;
    const saved = JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      session: state,
      checkpoint: initial,
      reducedMotion: false,
    });
    expect(decode(saved)?.session.menu['matcha-latte'].calculatedHpp).toBe(6300);
    state.menu['matcha-latte'].calculatedHpp = -1;
    expect(validSession(state)).toBe(false);
  });
});
