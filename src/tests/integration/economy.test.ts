import { describe, expect, it } from 'vitest';
import { CONFIG, STARTER_CART, productIds } from '../../data/catalog';
import { createSession, dispatchCommand, type Command } from '../../application/commands';
import {
  capacity,
  consume,
  emptyInventory,
  inventoryValue,
  recipeCost,
  stock,
} from '../../domain/inventory/inventory';
import { integer, percentage, ratio } from '../../domain/economy/money';
import { chooseProduct, purchaseChance } from '../../domain/customer/customer';
import { createService } from '../../domain/customer/service';
import { buildReport } from '../../domain/reports/report';
import type { Session } from '../../domain/types';
import {
  BACKUP_KEY,
  SAVE_KEY,
  decode,
  readSave,
  validSession,
  writeSave,
  type SaveEnvelope,
  type StoragePort,
} from '../../infrastructure/persistence/save';

function act(s: Session, command: Command): Session {
  const result = dispatchCommand(s, command);
  expect(result.error, result.message).toBeFalsy();
  return result.state;
}
function stocked(): Session {
  return act(createSession(1234, 'test-cafe'), { type: 'buy', cart: STARTER_CART });
}
function order(s: Session, sequence: number): Session {
  const next = structuredClone(s);
  next.day.visitors++;
  next.day.customerSequence++;
  next.day.elapsed += 2;
  const service = createService({ id: `order-${sequence}`, archetype: 'student' }, 'ordered');
  service.stage = 'ready';
  service.style = 'quick';
  service.startedAt = next.day.elapsed - 2;
  service.readyAt = next.day.elapsed;
  next.day.customers.push({
    id: `order-${sequence}`,
    name: 'Naya',
    archetype: 'student',
    product: 'matcha-latte',
    budget: 12_000,
    price: next.menu['matcha-latte'].price,
    arrivedAt: next.day.elapsed - 2,
    patience: 45,
    service,
  });
  return next;
}
function dayWithSales(count: number): Session {
  let s = act(stocked(), { type: 'open' });
  for (let n = 0; n < count; n++) {
    s = order(s, n);
    s = act(s, { type: 'serve', id: `order-${n}` });
  }
  return act(s, { type: 'close' });
}
function envelope(s: Session): SaveEnvelope {
  return {
    version: 1,
    session: s,
    checkpoint: createSession(1234, s.id),
    savedAt: '2026-10-16T08:00:00Z',
    reducedMotion: false,
  };
}
function storage(): StoragePort {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

describe('integer Rupiah and COGS', () => {
  it('computes the approved recipes', () => {
    expect(productIds.map((id) => recipeCost(emptyInventory(), id).hpp)).toEqual([
      6300, 6300, 6000,
    ]);
  });
  it('rounds exact halves upward and preserves integer results', () => {
    expect(ratio(5, 1, 2)).toBe(3);
    expect(ratio(10001, 1500, 10000)).toBe(1500);
  });
  it.each([NaN, Infinity, -1, 0.1, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid monetary inputs %s',
    (value) => expect(() => integer(value)).toThrow(),
  );
  it('rejects zero divisors and multiplication overflow', () => {
    expect(() => ratio(100, 1, 0)).toThrow();
    expect(() => ratio(Number.MAX_SAFE_INTEGER, 2, 3)).toThrow();
  });
  it('distinguishes cost-based profit percent and a zero denominator', () => {
    expect(percentage(3700, 6300)).toBe(58.73);
    expect(percentage(0, 0)).toBeNull();
  });
  it('allocates the full price of an indivisible batch exactly', () => {
    const inv = emptyInventory();
    inv.matcha = [{ id: 'fraction', cost: 100, quantity: 3, consumed: 0 }];
    expect([
      consume(inv, 'matcha', 1),
      consume(inv, 'matcha', 1),
      consume(inv, 'matcha', 1),
    ]).toEqual([33, 34, 33]);
    expect(inventoryValue(inv)).toBe(0);
  });
  it('consumes older batches before newer, differently priced ones', () => {
    const inv = emptyInventory();
    inv.matcha = [
      { id: 'old', cost: 100, quantity: 10, consumed: 0 },
      { id: 'new', cost: 200, quantity: 10, consumed: 0 },
    ];
    expect(consume(inv, 'matcha', 15)).toBe(200);
    expect(inventoryValue(inv)).toBe(100);
  });
});

describe('preparation and atomic transactions', () => {
  it('turns cash into inventory without recording a loss', () => {
    const s = stocked();
    expect(s.cash).toBe(260000);
    expect(inventoryValue(s.inventory)).toBe(240000);
    expect(buildReport(s).profit).toBe(0);
    expect(stock(s.inventory, 'milk')).toBe(4000);
  });
  it('does not mutate its input', () => {
    const original = createSession();
    const snapshot = structuredClone(original);
    act(original, { type: 'buy', cart: STARTER_CART });
    expect(original).toEqual(snapshot);
  });
  it.each([{ milk: -1 }, { milk: 1.5 }, { milk: 101 }, { matcha: 100 }])(
    'rejects invalid/unaffordable purchases without partial changes',
    (cart) => {
      const s = createSession();
      const r = dispatchCommand(s, { type: 'buy', cart });
      expect(r.error).toBe(true);
      expect(r.state).toBe(s);
    },
  );
  it('allows deliberate below-COGS prices but rejects invalid ones', () => {
    const calculated = act(stocked(), {
      type: 'calculate_hpp',
      product: 'matcha-latte',
      answer: 6300,
    });
    const s = act(calculated, { type: 'price', product: 'matcha-latte', price: 6000 });
    expect(s.menu['matcha-latte'].price).toBe(6000);
    for (const price of [0, -1, 5.5, NaN, Infinity, 100001])
      expect(dispatchCommand(s, { type: 'price', product: 'matcha-latte', price }).error).toBe(
        true,
      );
  });
  it('requires stock and operating reserve before opening', () => {
    expect(dispatchCommand(createSession(), { type: 'open' }).error).toBe(true);
    const s = stocked();
    s.cash = 19000;
    expect(dispatchCommand(s, { type: 'open' }).error).toBe(true);
  });
  it('locks preparation mutations during opening hours', () => {
    const s = act(stocked(), { type: 'open' });
    expect(dispatchCommand(s, { type: 'buy', cart: { milk: 1 } }).error).toBe(true);
    expect(dispatchCommand(s, { type: 'price', product: 'matcha-latte', price: 12000 }).error).toBe(
      true,
    );
  });
  it('charges exactly once and consumes all ingredients atomically', () => {
    let s = act(stocked(), { type: 'open' });
    s = order(s, 1);
    const sold = act(s, { type: 'serve', id: 'order-1' });
    expect(sold.cash).toBe(270000);
    expect(stock(sold.inventory, 'matcha')).toBe(490);
    expect(stock(sold.inventory, 'milk')).toBe(3800);
    expect(stock(sold.inventory, 'cup')).toBe(19);
    expect(sold.day.receipts[0].hpp).toBe(6300);
    const duplicate = dispatchCommand(sold, { type: 'serve', id: 'order-1' });
    expect(duplicate.error).toBe(true);
    expect(duplicate.state).toBe(sold);
  });
  it('rejects an order if another customer consumed its last ingredient', () => {
    let s = act(stocked(), { type: 'open' });
    s = order(s, 1);
    s.inventory.cup = [];
    const r = dispatchCommand(s, { type: 'serve', id: 'order-1' });
    expect(r.error).toBe(true);
    expect(r.state).toBe(s);
    expect(stock(s.inventory, 'matcha')).toBe(500);
  });
  it('shares milk and cups across recipes', () => {
    const s = stocked();
    expect(productIds.map((id) => capacity(s.inventory, id))).toEqual([20, 20, 20]);
    s.inventory.milk[0].consumed = 4000;
    expect(productIds.map((id) => capacity(s.inventory, id))).toEqual([0, 0, 0]);
  });
});

describe('day accounting and reports', () => {
  it('reconciles the planned 20-cup acceptance scenario', () => {
    const s = dayWithSales(20);
    const r = s.reports[0];
    expect(r).toMatchObject({
      revenue: 200000,
      discount: 0,
      hpp: 126000,
      operating: 20000,
      tax: 0,
      profit: 54000,
      profitPct: 36.99,
      customers: 20,
      cashEnd: 440000,
      inventoryValue: 114000,
    });
    expect(s.cash + inventoryValue(s.inventory)).toBe(CONFIG.initialCash + r.profit);
    expect(validSession(s)).toBe(true);
  });
  it('shows a daily loss despite profitable individual drinks', () => {
    const r = dayWithSales(5).reports[0];
    expect(r.profit).toBe(-1500);
    expect(r.receipts.every((x) => x.price > x.hpp)).toBe(true);
  });
  it('charges a zero-sale day exactly once', () => {
    const s = dayWithSales(0);
    expect(s.reports[0].profit).toBe(-20000);
    expect(dispatchCommand(s, { type: 'close' }).error).toBe(true);
    expect(dispatchCommand(s, { type: 'finish' }).state).toBe(s);
  });
  it('preserves historic receipts when tomorrow prices change', () => {
    let s = dayWithSales(1);
    const old = structuredClone(s.reports[0]);
    s = act(s, { type: 'next' });
    s = act(s, { type: 'calculate_hpp', product: 'matcha-latte', answer: 6300 });
    s = act(s, { type: 'price', product: 'matcha-latte', price: 12000 });
    expect(s.reports[0]).toEqual(old);
    expect(s.day.cashStart).toBe(s.cash);
    expect(validSession(s)).toBe(true);
  });
  it('stops new arrivals during closing and settles after the grace period', () => {
    let s = order(act(stocked(), { type: 'open' }), 1);
    s = act(s, { type: 'close' });
    const visitors = s.day.visitors;
    for (let n = 0; n < CONFIG.closingSeconds; n++) s = act(s, { type: 'tick' });
    expect(s.day.phase).toBe('report');
    expect(s.day.visitors).toBe(visitors);
    expect(s.reports).toHaveLength(1);
  });
});

describe('customer decisions and repeatable simulations', () => {
  it('never selects an unaffordable or unavailable product', () => {
    const s = stocked();
    expect(chooseProduct(s, 'student', 1000)).toBeNull();
    s.inventory.milk = [];
    expect(chooseProduct(s, 'loyal', 100000)).toBeNull();
  });
  it('keeps affordability and reputation effects monotonic', () => {
    expect(purchaseChance(8000, 50, 'student')).toBeGreaterThan(
      purchaseChance(12000, 50, 'student'),
    );
    expect(purchaseChance(10000, 80, 'worker')).toBeGreaterThan(
      purchaseChance(10000, 30, 'worker'),
    );
  });
  it('replays a day deterministically and conserves cash plus inventory', () => {
    const run = () => {
      let s = act(stocked(), { type: 'open' });
      for (let n = 0; n < 220 && s.day.phase !== 'report'; n++) {
        s = act(s, { type: 'tick' });
        for (const c of s.day.customers) {
          if (c.service.stage === 'greeting')
            s = act(s, { type: 'offer', id: c.id, product: c.product });
          else if (c.service.stage === 'ordered') s = act(s, { type: 'brew', id: c.id });
          else if (c.service.stage === 'ready') s = act(s, { type: 'serve', id: c.id });
        }
      }
      expect(validSession(s)).toBe(true);
      expect(s.day.phase).toBe('report');
      expect(s.cash + inventoryValue(s.inventory)).toBe(CONFIG.initialCash + s.reports[0].profit);
      return s;
    };
    expect(run()).toEqual(run());
  });
  it('does not advance business time outside opening hours', () => {
    const s = createSession();
    expect(dispatchCommand(s, { type: 'tick' }).state).toBe(s);
  });
});

describe('save recovery', () => {
  it('rejects malformed inventory entries without crashing the validator', () => {
    const malformed = { ...stocked(), inventory: { ...stocked().inventory, milk: [null] } };
    expect(validSession(malformed)).toBe(false);
    expect(() => decode(JSON.stringify(envelope(malformed as unknown as Session)))).toThrow();
  });
  it('round-trips an active session and RNG without duplicated transactions', () => {
    let s = act(stocked(), { type: 'open' });
    s = order(s, 1);
    s = act(s, { type: 'serve', id: 'order-1' });
    const restored = decode(JSON.stringify(envelope(s))).session;
    expect(restored).toEqual(s);
    expect(dispatchCommand(restored, { type: 'serve', id: 'order-1' }).error).toBe(true);
  });
  it('restores the last valid backup when the primary is corrupt', () => {
    const port = storage();
    writeSave(port, envelope(createSession(1234, 'test-cafe')));
    writeSave(port, envelope(stocked()));
    port.setItem(SAVE_KEY, '{damaged');
    const r = readSave(port);
    expect(r.data?.session.cash).toBe(500000);
    expect(r.warning).toContain('backup');
  });
  it('rejects unknown versions, invalid references and contradictory cash', () => {
    const valid = envelope(stocked());
    expect(() => decode(JSON.stringify({ ...valid, version: 2 }))).toThrow();
    expect(decode(JSON.stringify({ ...valid, musicEnabled: false })).musicEnabled).toBe(false);
    expect(() => decode(JSON.stringify({ ...valid, musicEnabled: 'off' }))).toThrow();
    const beforeMusicSetting = { ...valid };
    delete beforeMusicSetting.musicEnabled;
    expect(decode(JSON.stringify(beforeMusicSetting)).musicEnabled).toBeUndefined();
    const wrong = structuredClone(valid);
    wrong.session.cash++;
    expect(() => decode(JSON.stringify(wrong))).toThrow();
    const negative = structuredClone(valid);
    negative.session.inventory.milk[0].consumed = -1;
    expect(() => decode(JSON.stringify(negative))).toThrow();
  });
  it('preserves unreadable data rather than silently resetting', () => {
    const port = storage();
    port.setItem(SAVE_KEY, 'not-json');
    const r = readSave(port);
    expect(r.data).toBeNull();
    expect(r.warning).toBeTruthy();
    expect(port.getItem(SAVE_KEY)).toBe('not-json');
  });
  it('surfaces storage quota failures and retains valid data', () => {
    const port = storage();
    writeSave(port, envelope(createSession(1234, 'test-cafe')));
    const old = port.getItem(SAVE_KEY);
    const failing: StoragePort = {
      ...port,
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    expect(() => writeSave(failing, envelope(stocked()))).toThrow();
    expect(port.getItem(SAVE_KEY)).toBe(old);
    expect(port.getItem(BACKUP_KEY)).toBeNull();
  });
});
