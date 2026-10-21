import {
  CONFIG,
  INGREDIENTS,
  PRODUCTS,
  PEOPLE,
  ingredientIds,
  productIds,
} from '../../data/catalog';
import type { Session } from '../../domain/types';
import { BREW_SECONDS } from '../../domain/customer/service';
import { quotePrice } from '../../domain/promotion/promotion';

export const SAVE_KEY = 'numbrew.save.v1';
export const BACKUP_KEY = 'numbrew.backup.v1';
const LEGACY_SAVE_KEY = 'kafe-hitung.save.v1';
const LEGACY_BACKUP_KEY = 'kafe-hitung.backup.v1';
export interface SaveEnvelope {
  version: 1;
  savedAt: string;
  session: Session;
  checkpoint: Session;
  reducedMotion: boolean;
  musicEnabled?: boolean;
}
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
const object = (x: unknown): x is Record<string, any> =>
  !!x && typeof x === 'object' && !Array.isArray(x);
const uint = (x: unknown, max = Number.MAX_SAFE_INTEGER): x is number =>
  typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 && x <= max;
const text = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length < 300;
const signed = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x);
const unique = (items: unknown[]) =>
  items.every((x) => object(x) && text(x.id)) &&
  new Set(items.map((x) => (x as { id: string }).id)).size === items.length;

function validService(service: unknown, elapsed: number, arrivedAt: number): boolean {
  if (
    !object(service) ||
    !['greeting', 'ordered', 'preparing', 'ready'].includes(service.stage) ||
    !uint(service.variant, 2) ||
    typeof service.askedTaste !== 'boolean' ||
    typeof service.askedBudget !== 'boolean' ||
    !uint(service.refusals, 2) ||
    !text(service.line)
  )
    return false;
  if (service.stage === 'greeting' || service.stage === 'ordered')
    return service.style === null && service.startedAt === null && service.readyAt === null;
  if (
    !Object.prototype.hasOwnProperty.call(BREW_SECONDS, service.style) ||
    !uint(service.startedAt, elapsed) ||
    service.startedAt < arrivedAt ||
    !uint(service.readyAt, elapsed + 6) ||
    service.readyAt - service.startedAt !== BREW_SECONDS[service.style as keyof typeof BREW_SECONDS]
  )
    return false;
  return service.stage === 'preparing' ? service.readyAt > elapsed : service.readyAt <= elapsed;
}

function migrateLegacyService(session: unknown): void {
  if (!object(session) || !object(session.day) || !Array.isArray(session.day.customers)) return;
  for (const customer of session.day.customers) {
    if (!object(customer) || Object.prototype.hasOwnProperty.call(customer, 'service')) continue;
    // Old orders were already accepted; preserve their product and locked price.
    customer.service = {
      stage: 'ordered',
      variant: 0,
      askedTaste: false,
      askedBudget: false,
      refusals: 0,
      line: 'My order has been taken. Thank you!',
      style: null,
      startedAt: null,
      readyAt: null,
    };
  }
}

function validDiscount(gross: unknown, discount: unknown, percent: unknown): boolean {
  return (
    uint(gross, CONFIG.maxPrice) &&
    gross > 0 &&
    uint(discount, gross - 1) &&
    uint(percent, CONFIG.maxDiscountPercent) &&
    quotePrice({ price: gross, discountPercent: percent }).discount === discount
  );
}

function validReceipt(r: any): boolean {
  return (
    object(r) &&
    text(r.id) &&
    text(r.customerId) &&
    text(r.customer) &&
    !!PRODUCTS[r.product as keyof typeof PRODUCTS] &&
    uint(r.day) &&
    r.day > 0 &&
    uint(r.time) &&
    uint(r.price, CONFIG.maxPrice) &&
    r.price > 0 &&
    validDiscount(r.price, r.discount, r.discountPercent ?? 0) &&
    r.tax === 0 &&
    uint(r.hpp) &&
    Array.isArray(r.lines) &&
    r.lines.length === 3 &&
    r.lines.every(
      (l: any) =>
        object(l) &&
        !!INGREDIENTS[l.ingredient as keyof typeof INGREDIENTS] &&
        uint(l.quantity) &&
        l.quantity > 0 &&
        uint(l.cost),
    ) &&
    new Set(r.lines.map((l: any) => l.ingredient)).size === 3 &&
    r.lines.every(
      (l: any) =>
        PRODUCTS[r.product as keyof typeof PRODUCTS].recipe[
          l.ingredient as keyof typeof INGREDIENTS
        ] === l.quantity,
    ) &&
    r.lines.reduce((n: number, l: any) => n + l.cost, 0) === r.hpp
  );
}

export function validSession(s: unknown): s is Session {
  if (
    !object(s) ||
    !text(s.id) ||
    !uint(s.revision) ||
    s.dataVersion !== 1 ||
    !uint(s.rng, 0xffffffff) ||
    s.rng === 0 ||
    !uint(s.cash, CONFIG.maxCash) ||
    !uint(s.reputation, 100) ||
    typeof s.tutorialSeen !== 'boolean'
  )
    return false;
  if (!object(s.inventory) || !object(s.menu)) return false;
  if (
    !ingredientIds.every(
      (id) =>
        Array.isArray(s.inventory[id]) &&
        s.inventory[id].length <= 3000 &&
        unique(s.inventory[id]) &&
        s.inventory[id].every(
          (b: any) =>
            object(b) &&
            text(b.id) &&
            uint(b.quantity, 10_000_000) &&
            b.quantity > 0 &&
            uint(b.consumed, b.quantity) &&
            uint(b.cost, CONFIG.maxCash),
        ),
    )
  )
    return false;
  if (
    !productIds.every(
      (id) =>
        object(s.menu[id]) &&
        typeof s.menu[id].active === 'boolean' &&
        uint(s.menu[id].price, CONFIG.maxPrice) &&
        s.menu[id].price > 0 &&
        (s.menu[id].discountPercent === undefined ||
          uint(s.menu[id].discountPercent, CONFIG.maxDiscountPercent)) &&
        (s.menu[id].calculatedHpp === undefined ||
          (uint(s.menu[id].calculatedHpp, CONFIG.maxCash) && s.menu[id].calculatedHpp > 0)),
    )
  )
    return false;
  const d = s.day;
  if (
    !object(d) ||
    !uint(d.number) ||
    d.number < 1 ||
    !['preparation', 'open', 'closing', 'report'].includes(d.phase) ||
    !uint(d.elapsed, 86400) ||
    !uint(d.closeAt, 86400) ||
    !uint(d.nextArrival, 86400) ||
    !uint(d.customerSequence) ||
    !uint(d.cashStart, CONFIG.maxCash) ||
    !uint(d.reputationStart, 100) ||
    !uint(d.operatingCost, CONFIG.maxCash) ||
    !uint(d.duration, 86400) ||
    d.duration === 0 ||
    d.taxRateBps !== 0 ||
    !uint(d.purchases) ||
    !uint(d.visitors) ||
    typeof d.settled !== 'boolean'
  )
    return false;
  if ((d.phase === 'report') !== d.settled) return false;
  if (
    !object(d.missed) ||
    ![
      'over_budget',
      'no_available_menu',
      'low_interest',
      'queue_full',
      'wait_timeout',
      'closing',
    ].every((k) => uint(d.missed[k]))
  )
    return false;
  if (
    !Array.isArray(d.customers) ||
    d.customers.length > 3 ||
    !d.customers.every(
      (c: any) =>
        object(c) &&
        text(c.id) &&
        text(c.name) &&
        !!PEOPLE[c.archetype as keyof typeof PEOPLE] &&
        !!PRODUCTS[c.product as keyof typeof PRODUCTS] &&
        uint(c.budget, CONFIG.maxPrice) &&
        uint(c.price, c.budget) &&
        c.price > 0 &&
        validDiscount(c.price + (c.discount ?? 0), c.discount ?? 0, c.discountPercent ?? 0) &&
        uint(c.arrivedAt, d.elapsed) &&
        uint(c.patience, 600) &&
        c.patience > 0 &&
        validService(c.service, d.elapsed, c.arrivedAt),
    ) ||
    !unique(d.customers)
  )
    return false;
  if (
    !Array.isArray(d.receipts) ||
    !d.receipts.every(validReceipt) ||
    !unique(d.receipts) ||
    d.receipts.some(
      (r: any) => r.day !== d.number || d.customers.some((c: any) => c.id === r.customerId),
    )
  )
    return false;
  if (new Set(d.receipts.map((r: any) => r.customerId)).size !== d.receipts.length) return false;
  const expectedCash =
    d.cashStart -
    d.purchases +
    d.receipts.reduce((n: number, r: any) => n + r.price - r.discount, 0) -
    (d.settled ? d.operatingCost : 0);
  if (s.cash !== expectedCash) return false;
  if (
    !Array.isArray(s.ledger) ||
    s.ledger.length > 10000 ||
    !s.ledger.every(
      (l: any) =>
        object(l) &&
        text(l.id) &&
        uint(l.day) &&
        ['purchase', 'sale', 'operating'].includes(l.kind) &&
        signed(l.amount) &&
        text(l.description),
    ) ||
    !unique(s.ledger)
  )
    return false;
  if (
    !Array.isArray(s.reports) ||
    s.reports.length > 100 ||
    !s.reports.every(
      (r: any) =>
        object(r) &&
        uint(r.day) &&
        r.day > 0 &&
        [
          'revenue',
          'discount',
          'netRevenue',
          'hpp',
          'operating',
          'tax',
          'customers',
          'visitors',
          'missed',
          'cashStart',
          'purchases',
          'cashEnd',
          'inventoryValue',
        ].every((k) => uint(r[k])) &&
        signed(r.profit) &&
        (r.calculatedProfit === undefined ||
          (signed(r.calculatedProfit) && r.calculatedProfit === r.profit)) &&
        signed(r.reputationChange) &&
        (r.profitPct === null ||
          (typeof r.profitPct === 'number' && Number.isFinite(r.profitPct))) &&
        Array.isArray(r.receipts) &&
        r.receipts.every(validReceipt) &&
        r.discount <= r.revenue &&
        r.netRevenue === r.revenue - r.discount &&
        r.profit === r.netRevenue - r.hpp - r.operating - r.tax,
    )
  )
    return false;
  return true;
}

export function decode(raw: string): SaveEnvelope {
  if (raw.length > 4_000_000) throw new Error('Save file is too large.');
  const data: unknown = JSON.parse(raw);
  if (object(data) && data.version === 1) {
    // Only parsed data is normalized; validation never mutates caller-owned sessions.
    migrateLegacyService(data.session);
    migrateLegacyService(data.checkpoint);
  }
  if (
    !object(data) ||
    data.version !== 1 ||
    !text(data.savedAt) ||
    !validSession(data.session) ||
    !validSession(data.checkpoint) ||
    data.checkpoint.day.phase !== 'preparation' ||
    data.checkpoint.id !== data.session.id ||
    typeof data.reducedMotion !== 'boolean' ||
    (data.musicEnabled !== undefined && typeof data.musicEnabled !== 'boolean')
  )
    throw new Error('The save is invalid or its version is not supported.');
  return data as unknown as SaveEnvelope;
}
export function readSave(storage: StoragePort): { data: SaveEnvelope | null; warning: string } {
  let damaged = false;
  for (const key of [SAVE_KEY, BACKUP_KEY, LEGACY_SAVE_KEY, LEGACY_BACKUP_KEY]) {
    const raw = storage.getItem(key);
    if (!raw) continue;
    try {
      const isBackup = key === BACKUP_KEY || key === LEGACY_BACKUP_KEY;
      const isLegacy = key === LEGACY_SAVE_KEY || key === LEGACY_BACKUP_KEY;
      return {
        data: decode(raw),
        warning: isBackup
          ? 'The main save is damaged. The latest backup was restored.'
          : isLegacy
            ? 'A Kafe Hitung save was found and will continue in NumBrew.'
            : '',
      };
    } catch {
      damaged = true;
    }
  }
  return {
    data: null,
    warning: damaged
      ? 'The save could not be read. Your old data has been kept; a new game will only start if you choose it.'
      : '',
  };
}
export function writeSave(storage: StoragePort, envelope: SaveEnvelope): void {
  // Validate before writing either key; never replace the backup with corrupt JSON.
  const encoded = JSON.stringify(envelope);
  decode(encoded);
  const prior = storage.getItem(SAVE_KEY);
  if (prior) {
    try {
      decode(prior);
    } catch {
      storage.setItem(SAVE_KEY, encoded);
      return;
    }
    storage.setItem(BACKUP_KEY, prior);
  }
  storage.setItem(SAVE_KEY, encoded);
}
