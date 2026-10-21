import { describe, expect, it } from 'vitest';
import { createSession, dispatchCommand } from '../../application/commands';
import { STARTER_CART } from '../../data/catalog';
import type { Customer, Session } from '../../domain/types';
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

function activeSession(): Session {
  const stocked = dispatchCommand(createSession(1234, 'service-save-cafe'), {
    type: 'buy',
    cart: STARTER_CART,
  }).state;
  const session = dispatchCommand(stocked, { type: 'open' }).state;
  session.day.elapsed = 12;
  session.day.nextArrival = 100;
  session.day.visitors = 1;
  session.day.customerSequence = 1;
  session.day.customers.push({
    id: 'customer-save-1',
    name: 'Naya',
    archetype: 'student',
    product: 'matcha-latte',
    budget: 12_000,
    price: 10_000,
    arrivedAt: 5,
    patience: 45,
    service: {
      stage: 'ordered',
      variant: 1,
      askedTaste: true,
      askedBudget: false,
      refusals: 0,
      line: 'Saya pilih Matcha Latte. Tolong racik dengan teliti, please.',
      style: null,
      startedAt: null,
      readyAt: null,
    },
  });
  return session;
}

function envelope(session = activeSession()): SaveEnvelope {
  return {
    version: 1,
    savedAt: '2026-10-16T08:00:00Z',
    session,
    checkpoint: createSession(1234, session.id),
    reducedMotion: false,
  };
}

function memoryStorage(): StoragePort {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

function legacyEnvelope() {
  const legacy = JSON.parse(JSON.stringify(envelope()));
  delete legacy.session.day.customers[0].service;
  return legacy;
}

describe('customer service save compatibility', () => {
  it('migrates accepted legacy orders without changing money, inventory, price, or RNG', () => {
    const legacy = legacyEnvelope();
    const original = structuredClone(legacy);
    const restored = decode(JSON.stringify(legacy));
    expect(restored.session.day.customers[0].service).toEqual({
      stage: 'ordered',
      variant: 0,
      askedTaste: false,
      askedBudget: false,
      refusals: 0,
      line: 'My order has been taken. Thank you!',
      style: null,
      startedAt: null,
      readyAt: null,
    });
    const restoredWithoutService = JSON.parse(JSON.stringify(restored));
    delete restoredWithoutService.session.day.customers[0].service;
    expect(restoredWithoutService).toEqual(original);
    expect(legacy).toEqual(original);
    expect(validSession(restored.session)).toBe(true);
  });

  it('does not mutate legacy API input during validation', () => {
    const legacy = legacyEnvelope().session;
    const original = structuredClone(legacy);
    expect(validSession(legacy)).toBe(false);
    expect(legacy).toEqual(original);
    expect('service' in legacy.day.customers[0]).toBe(false);
  });

  it('migrates legacy customers in the checkpoint as well as the current session', () => {
    const legacy = legacyEnvelope();
    legacy.checkpoint = structuredClone(legacy.session);
    legacy.checkpoint.day.phase = 'preparation';
    const restored = decode(JSON.stringify(legacy));
    expect(restored.checkpoint.day.customers[0].service.stage).toBe('ordered');
    expect(restored.session.day.customers[0].service.stage).toBe('ordered');
  });

  it('can recover and migrate a legacy backup when the primary is corrupt', () => {
    const port = memoryStorage();
    port.setItem(SAVE_KEY, '{damaged');
    port.setItem(BACKUP_KEY, JSON.stringify(legacyEnvelope()));
    const restored = readSave(port);
    expect(restored.warning).toContain('backup');
    expect(restored.data?.session.day.customers[0].service.stage).toBe('ordered');
    expect(port.getItem(SAVE_KEY)).toBe('{damaged');
  });

  it.each([
    { stage: 'preparing', style: 'standard', startedAt: 12, readyAt: 18 },
    { stage: 'ready', style: 'standard', startedAt: 6, readyAt: 12 },
    { stage: 'preparing', style: 'careful', startedAt: 12, readyAt: 18 },
    { stage: 'preparing', style: 'quick', startedAt: 12, readyAt: 14 },
    { stage: 'ready', style: 'careful', startedAt: 6, readyAt: 12 },
    { stage: 'ready', style: 'quick', startedAt: 8, readyAt: 10 },
  ] as const)('round-trips a $style order at $stage without advancing its timer', (timing) => {
    const session = activeSession();
    Object.assign(session.day.customers[0].service, timing);
    const saved = envelope(session);
    const port = memoryStorage();
    writeSave(port, saved);
    const restored = decode(port.getItem(SAVE_KEY)!);
    expect(restored).toEqual(saved);
    expect(restored.session.day.elapsed).toBe(12);
    expect(restored.session.cash).toBe(260_000);
    expect(restored.session.day.receipts).toHaveLength(0);
  });

  it.each([
    { service: null },
    { service: {} },
    { stage: 'unknown' },
    { variant: 3 },
    { variant: 0.5 },
    { askedTaste: 'yes' },
    { askedBudget: null },
    { refusals: 3 },
    { refusals: -1 },
    { line: '' },
    { line: 'x'.repeat(300) },
    { style: 'quick' },
    { startedAt: 12 },
    { readyAt: 14 },
    { stage: 'greeting', style: 'careful', startedAt: 6, readyAt: 12 },
    { stage: 'preparing', style: null, startedAt: 12, readyAt: 18 },
    { stage: 'preparing', style: 'instant', startedAt: 12, readyAt: 18 },
    { stage: 'preparing', style: 'careful', startedAt: 13, readyAt: 19 },
    { stage: 'preparing', style: 'careful', startedAt: 4, readyAt: 10 },
    { stage: 'preparing', style: 'careful', startedAt: 6, readyAt: 12 },
    { stage: 'preparing', style: 'quick', startedAt: 12, readyAt: 15 },
    { stage: 'preparing', style: 'quick', startedAt: 12, readyAt: 13.5 },
    { stage: 'preparing', style: 'careful', startedAt: 12, readyAt: 12 },
    { stage: 'ready', style: 'quick', startedAt: 12, readyAt: 14 },
    { stage: 'ready', style: 'careful', startedAt: null, readyAt: 12 },
  ])('rejects malformed service rather than treating it as a legacy order: %j', (patch) => {
    const saved = envelope();
    const customer = saved.session.day.customers[0];
    if ('service' in patch) customer.service = patch.service as Customer['service'];
    else Object.assign(customer.service, patch);
    const before = structuredClone(saved.session);
    expect(validSession(saved.session)).toBe(false);
    expect(saved.session).toEqual(before);
    expect(() => decode(JSON.stringify(saved))).toThrow();
  });

  it('keeps the locked price within the customer budget after migration', () => {
    const legacy = legacyEnvelope();
    legacy.session.day.customers[0].price = 12_001;
    expect(() => decode(JSON.stringify(legacy))).toThrow();
  });
});
