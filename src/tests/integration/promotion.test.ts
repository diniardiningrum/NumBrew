import { describe, expect, it } from 'vitest';
import { createSession, dispatchCommand, type Command } from '../../application/commands';
import { CONFIG, STARTER_CART, productIds } from '../../data/catalog';
import { quotePrice } from '../../domain/promotion/promotion';
import { chooseProduct, purchaseChance } from '../../domain/customer/customer';
import { createService, brewingCapacity } from '../../domain/customer/service';
import { inventoryValue, stock } from '../../domain/inventory/inventory';
import { buildReport } from '../../domain/reports/report';
import {
  decode,
  validSession,
  readSave,
  writeSave,
  SAVE_KEY,
  type SaveEnvelope,
} from '../../infrastructure/persistence/save';
import type { Session } from '../../domain/types';

function act(state: Session, command: Command) {
  const result = dispatchCommand(state, command);
  expect(result.error, result.message).toBeFalsy();
  return result.state;
}
function stocked() {
  return act(createSession(4321, 'promo-test'), { type: 'buy', cart: STARTER_CART });
}
function guest(state: Session, id = 'guest', budget = 12000) {
  const quote = quotePrice(state.menu['matcha-latte']);
  state.day.visitors++;
  state.day.customerSequence++;
  state.day.customers.push({
    id,
    name: 'Naya',
    archetype: 'student',
    product: 'matcha-latte',
    price: quote.net,
    budget,
    discount: quote.discount,
    discountPercent: quote.discountPercent,
    arrivedAt: state.day.elapsed,
    patience: 45,
    service: createService({ id, archetype: 'student' }),
  });
  return state;
}
function sale(state: Session, id = 'guest') {
  state = act(state, { type: 'offer', id, product: 'matcha-latte' });
  state = act(state, { type: 'brew', id });
  for (let n = 0; n < CONFIG.preparationSeconds; n++) state = act(state, { type: 'tick' });
  return dispatchCommand(state, { type: 'serve', id });
}
function envelope(session: Session): SaveEnvelope {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    session,
    checkpoint: createSession(4321, session.id),
    reducedMotion: false,
  };
}

describe('discount pricing and accounting', () => {
  it.each([
    [10000, 0, 0, 10000],
    [10000, 15, 1500, 8500],
    [10003, 50, 5002, 5001],
    [9999, 15, 1500, 8499],
    [1, 50, 0, 1],
  ])('quotes %i at %i%% as discount=%i paid=%i', (price, discountPercent, discount, net) => {
    expect(quotePrice({ price, discountPercent })).toEqual({
      gross: price,
      discountPercent,
      discount,
      net,
    });
  });
  it.each([-1, 51, 10.5, NaN, Infinity])('rejects invalid discount %s atomically', (percent) => {
    const initial = stocked();
    const result = dispatchCommand(initial, {
      type: 'promotion',
      product: 'matcha-latte',
      percent,
    });
    expect(result.error).toBe(true);
    expect(result.state).toBe(initial);
  });
  it('sets and removes per-menu promotions only before opening', () => {
    let state = act(stocked(), { type: 'promotion', product: 'matcha-latte', percent: 20 });
    expect(quotePrice(state.menu['coffee-latte']).discount).toBe(0);
    state = act(state, { type: 'promotion', product: 'matcha-latte', percent: 0 });
    expect(quotePrice(state.menu['matcha-latte']).net).toBe(10000);
    state = act(state, { type: 'open' });
    expect(
      dispatchCommand(state, { type: 'promotion', product: 'matcha-latte', percent: 20 }).state,
    ).toBe(state);
  });
  it('compares customer budget to the price after discount and increases purchase interest', () => {
    let state = stocked();
    state.menu['coffee-latte'].active = false;
    state.menu['cocoa-latte'].active = false;
    state.menu['matcha-latte'].price = 12000;
    expect(chooseProduct(state, 'student', 10000)).toBeNull();
    state = act(state, { type: 'promotion', product: 'matcha-latte', percent: 20 });
    expect(chooseProduct(state, 'student', 10000)).toBe('matcha-latte');
    expect(purchaseChance(9600, 50, 'student', 20)).toBeGreaterThan(
      purchaseChance(12000, 50, 'student'),
    );
    const studentBoost =
      purchaseChance(10000, 50, 'student', 20) - purchaseChance(10000, 50, 'student');
    const workerBoost =
      purchaseChance(10000, 50, 'worker', 20) - purchaseChance(10000, 50, 'worker');
    expect(studentBoost).toBeGreaterThan(workerBoost);
    state = guest(act(state, { type: 'open' }), 'budget', 10000);
    state = act(state, { type: 'offer', id: 'budget', product: 'matcha-latte' });
    expect(state.day.customers[0]).toMatchObject({
      price: 9600,
      discount: 2400,
      service: { stage: 'ordered' },
    });
  });
  it('charges net cash once, keeps gross revenue, and does not reduce ingredient COGS', () => {
    let state = act(stocked(), { type: 'promotion', product: 'matcha-latte', percent: 20 });
    state = guest(act(state, { type: 'open' }));
    state.day.nextArrival = 1000;
    const before = structuredClone(state);
    const result = sale(state);
    expect(result.error).toBeFalsy();
    expect(result.receipt).toMatchObject({
      price: 10000,
      discount: 2000,
      discountPercent: 20,
      hpp: 6300,
    });
    expect(result.state.cash).toBe(before.cash + 8000);
    expect(result.state.ledger.at(-1)?.amount).toBe(8000);
    expect(result.reaction?.contribution).toBe(1700);
    expect(stock(result.state.inventory, 'milk')).toBe(stock(before.inventory, 'milk') - 200);
    expect(dispatchCommand(result.state, { type: 'serve', id: 'guest' }).state).toBe(result.state);
    state = act(result.state, { type: 'close' });
    expect(state.reports[0]).toMatchObject({
      revenue: 10000,
      discount: 2000,
      netRevenue: 8000,
      hpp: 6300,
      profit: -18300,
    });
    expect(state.cash + inventoryValue(state.inventory)).toBe(
      CONFIG.initialCash + state.reports[0].profit,
    );
    expect(validSession(state)).toBe(true);
  });
  it('can sell below cost and locks the quoted discount before brewing', () => {
    let state = act(stocked(), { type: 'promotion', product: 'matcha-latte', percent: 50 });
    state = guest(act(state, { type: 'open' }));
    state.day.nextArrival = 1000;
    state = act(state, { type: 'offer', id: 'guest', product: 'matcha-latte' });
    const cash = state.cash;
    // Even an independently changed menu cannot rewrite an accepted order's snapshot.
    state.menu['matcha-latte'].discountPercent = 0;
    state = act(state, { type: 'brew', id: 'guest' });
    expect(state.cash).toBe(cash);
    expect(state.day.receipts).toHaveLength(0);
    for (let n = 0; n < 6; n++) state = act(state, { type: 'tick' });
    const result = dispatchCommand(state, { type: 'serve', id: 'guest' });
    expect(result.reaction?.contribution).toBe(-1300);
    expect(result.receipt?.discount).toBe(5000);
    expect(result.state.cash).toBe(cash + 5000);
  });
  it('persists promos and receipts, restores backup, and reads saves without discount fields', () => {
    expect(
      decode(JSON.stringify(envelope(stocked()))).session.menu['matcha-latte'].discountPercent,
    ).toBeUndefined();
    let state = act(stocked(), { type: 'promotion', product: 'matcha-latte', percent: 15 });
    state = guest(act(state, { type: 'open' }));
    state.day.nextArrival = 1000;
    expect(decode(JSON.stringify(envelope(state))).session).toEqual(state);
    state = act(sale(state).state, { type: 'close' });
    const history = structuredClone(state.reports[0]);
    const data = new Map<string, string>();
    const port = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v);
      },
      removeItem: (k: string) => {
        data.delete(k);
      },
    };
    writeSave(port, envelope(state));
    let next = act(state, { type: 'next' });
    expect(next.menu['matcha-latte'].discountPercent).toBe(15);
    next = act(next, { type: 'promotion', product: 'matcha-latte', percent: 0 });
    expect(next.reports[0]).toEqual(history);
    writeSave(port, envelope(next));
    port.setItem(SAVE_KEY, '{bad');
    expect(readSave(port).data?.session).toEqual(state);
    state.day.receipts[0].discount++;
    expect(validSession(state)).toBe(false);
  });
  it('replays a discounted day with net revenue reconciled to cash and player profit answers', () => {
    function run() {
      let state = stocked();
      for (const product of productIds)
        state = act(state, { type: 'promotion', product, percent: 15 });
      state = act(state, { type: 'open' });
      for (let second = 0; second < 220 && state.day.phase !== 'report'; second++) {
        state = act(state, { type: 'tick' });
        for (const id of state.day.customers.map((c) => c.id)) {
          let c = state.day.customers.find((c) => c.id === id)!;
          if (c.service.stage === 'greeting' && brewingCapacity(state, c.product) > 0)
            state = act(state, { type: 'offer', id, product: c.product });
          c = state.day.customers.find((c) => c.id === id)!;
          if (c.service.stage === 'ordered' && brewingCapacity(state, c.product, id) > 0)
            state = act(state, { type: 'brew', id });
          else if (c.service.stage === 'ready') state = act(state, { type: 'serve', id });
        }
      }
      const report = state.reports[0];
      expect(report.discount).toBeGreaterThan(0);
      expect(report.netRevenue).toBe(report.revenue - report.discount);
      expect(state.cash + inventoryValue(state.inventory)).toBe(CONFIG.initialCash + report.profit);
      state = act(state, { type: 'calculate_profit', day: 1, answer: buildReport(state).profit });
      expect(validSession(state)).toBe(true);
      return state;
    }
    expect(run()).toEqual(run());
  });
});
