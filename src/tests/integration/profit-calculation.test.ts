import { describe, expect, it } from 'vitest';
import { createSession, dispatchCommand, type Command } from '../../application/commands';
import { STARTER_CART } from '../../data/catalog';
import { createService } from '../../domain/customer/service';
import type { Session } from '../../domain/types';
import { buildReport } from '../../domain/reports/report';
import {
  hasCalculatedProfit,
  parseProfitInput,
  profitBasis,
  profitFeedback,
} from '../../domain/reports/profitCalculation';
import { decode, validSession } from '../../infrastructure/persistence/save';

function act(state: Session, command: Command) {
  const result = dispatchCommand(state, command);
  expect(result.error, result.message).toBeFalsy();
  return result.state;
}
function completed(sales: number, price = 10000) {
  let state = act(createSession(123, 'profit-test'), { type: 'buy', cart: STARTER_CART });
  state = act(state, { type: 'calculate_hpp', product: 'matcha-latte', answer: 6300 });
  state = act(state, { type: 'price', product: 'matcha-latte', price });
  state = act(state, { type: 'open' });
  for (let n = 0; n < sales; n++) {
    const id = `guest-${n}`;
    state.day.elapsed += 6;
    state.day.visitors++;
    state.day.customerSequence++;
    state.day.customers.push({
      id,
      name: 'Naya',
      archetype: 'student',
      product: 'matcha-latte',
      budget: 12000,
      price,
      arrivedAt: state.day.elapsed - 6,
      patience: 45,
      service: {
        ...createService({ id, archetype: 'student' }, 'ordered'),
        stage: 'ready',
        style: 'standard',
        startedAt: state.day.elapsed - 6,
        readyAt: state.day.elapsed,
      },
    });
    state = act(state, { type: 'serve', id });
  }
  return act(state, { type: 'close' });
}

describe('player-calculated net profit or loss', () => {
  it.each([
    ['17000', 17000],
    ['17.000', 17000],
    ['-1500', -1500],
    [' -1.500 ', -1500],
    ['0', 0],
  ])('accepts signed Rupiah %s', (input, value) => {
    expect(parseProfitInput(String(input))).toBe(value);
  });
  it.each([
    '',
    ' ',
    '1.5',
    '1,500',
    '--1500',
    '- 1500',
    '1e3',
    'NaN',
    'Infinity',
    '9007199254740992',
  ])('rejects invalid input %s', (input) => {
    expect(parseProfitInput(input)).toBeNull();
  });
  it.each([
    [10, 10000, 17000],
    [5, 10000, -1500],
    [5, 10300, 0],
    [0, 10000, -20000],
  ])('checks sales=%i price=%i result=%i without moving money', (sales, price, answer) => {
    const before = completed(sales, price);
    expect(before.reports[0].profit).toBe(answer);
    const state = act(before, { type: 'calculate_profit', day: 1, answer });
    expect(state.reports[0].calculatedProfit).toBe(answer);
    expect(hasCalculatedProfit(state.reports[0])).toBe(true);
    expect(state.cash).toBe(before.cash);
    expect(state.inventory).toEqual(before.inventory);
    expect(state.ledger).toEqual(before.ledger);
    expect(state.reputation).toBe(before.reputation);
    expect(validSession(state)).toBe(true);
  });
  it.each([20000, -20001, 0, NaN, Infinity, -20000.5])(
    'rejects wrong result %s without revealing or overwriting it',
    (answer) => {
      const before = completed(0);
      const result = dispatchCommand(before, { type: 'calculate_profit', day: 1, answer });
      expect(result.error).toBe(true);
      expect(result.state).toBe(before);
      expect(result.message).not.toMatch(/20000|20\.000/);
    },
  );
  it('explains a missing minus sign and keeps zeros valid', () => {
    expect(profitFeedback(1500, -1500)).toContain('tanda minus');
    expect(profitFeedback(0, 0)).toBeNull();
    expect(profitFeedback(null, 0)).not.toBeNull();
  });
  it('allows historical calculations without changing the current day', () => {
    let state = act(completed(5), { type: 'next' });
    const currentDay = structuredClone(state.day);
    state = act(state, { type: 'calculate_profit', day: 1, answer: -1500 });
    expect(state.day).toEqual(currentDay);
    expect(state.reports[0].calculatedProfit).toBe(-1500);
    expect(dispatchCommand(state, { type: 'calculate_profit', day: 2, answer: 0 }).error).toBe(
      true,
    );
    expect(dispatchCommand(state, { type: 'calculate_profit', day: -1, answer: 0 }).error).toBe(
      true,
    );
  });
  it('persists answers, accepts old reports, and rejects malformed saved answers', () => {
    const old = completed(5);
    expect(validSession(old)).toBe(true);
    const state = act(old, { type: 'calculate_profit', day: 1, answer: -1500 });
    const restored = decode(
      JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        session: state,
        checkpoint: createSession(123, state.id),
        reducedMotion: false,
      }),
    );
    expect(restored.session.reports[0].calculatedProfit).toBe(-1500);
    state.reports[0].calculatedProfit = 1500;
    expect(validSession(state)).toBe(false);
  });
  it('distinguishes running calculation bases when underlying costs change', () => {
    const report = buildReport(createSession());
    expect(profitBasis({ ...report, hpp: 100, operating: 0 })).not.toBe(
      profitBasis({ ...report, hpp: 0, operating: 100 }),
    );
    expect(profitBasis({ ...report, day: 2 })).not.toBe(profitBasis(report));
  });
});
