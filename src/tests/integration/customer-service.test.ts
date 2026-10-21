import { describe, expect, it } from 'vitest';
import { createSession, dispatchCommand, type Command } from '../../application/commands';
import {
  CONFIG,
  PEOPLE,
  PRODUCTS,
  STARTER_CART,
  archetypes,
  type Archetype,
  type ProductId,
} from '../../data/catalog';
import {
  BREW_SECONDS,
  brewingCapacity,
  createArrivalService,
  createService,
} from '../../domain/customer/service';
import { inventoryValue, stock, recipeCost } from '../../domain/inventory/inventory';
import type { Customer, Session } from '../../domain/types';

function act(session: Session, command: Command): Session {
  const result = dispatchCommand(session, command);
  expect(result.error, result.message).toBeFalsy();
  return result.state;
}

function opened(prices: Partial<Record<ProductId, number>> = {}): Session {
  let session = act(createSession(1234, 'service-cafe'), { type: 'buy', cart: STARTER_CART });
  for (const [product, price] of Object.entries(prices)) {
    session = act(session, {
      type: 'calculate_hpp',
      product: product as ProductId,
      answer: recipeCost(session.inventory, product as ProductId).hpp,
    });
    session = act(session, { type: 'price', product: product as ProductId, price });
  }
  session = act(session, { type: 'open' });
  // Focus lifecycle tests on their inserted customers, independently of random arrivals.
  session.day.nextArrival = 10_000;
  return session;
}

function addCustomer(
  session: Session,
  id = 'guest-1',
  overrides: Partial<Omit<Customer, 'service'>> = {},
): Session {
  const state = structuredClone(session);
  const customer: Customer = {
    id,
    name: 'Naya',
    archetype: 'student',
    product: 'cocoa-latte',
    budget: 12_000,
    price: state.menu['cocoa-latte'].price,
    arrivedAt: state.day.elapsed,
    patience: 45,
    service: createService({ id, archetype: overrides.archetype ?? 'student' }),
    ...overrides,
  };
  state.day.visitors++;
  state.day.customerSequence++;
  state.day.customers.push(customer);
  return state;
}

function tick(session: Session, count: number): Session {
  let state = session;
  for (let n = 0; n < count; n++) state = act(state, { type: 'tick' });
  return state;
}

function ordered(session: Session, id = 'guest-1', product: ProductId = 'cocoa-latte'): Session {
  return act(session, { type: 'offer', id, product });
}

function prepared(): Session {
  let state = ordered(addCustomer(opened()));
  state = act(state, { type: 'brew', id: 'guest-1' });
  return tick(state, BREW_SECONDS.standard);
}

describe('customer conversations and recommendations', () => {
  it('uses a minority recommendation chance and names the selected menu for direct orders', () => {
    for (const archetype of archetypes) {
      const customer = { id: 'arrival-1', archetype, product: PEOPLE[archetype].favorite };
      const services = Array.from({ length: 100 }, (_, n) =>
        createArrivalService(customer, n / 100),
      );
      expect(services.filter((s) => s.stage === 'greeting')).toHaveLength(30);
      expect(services.filter((s) => s.stage === 'ordered')).toHaveLength(70);
      for (const service of services.filter((s) => s.stage === 'ordered')) {
        expect(service.line).toContain(PRODUCTS[customer.product].name);
        expect(service.askedTaste).toBe(false);
        expect(service.askedBudget).toBe(false);
      }
    }
  });

  it('lets a direct order prepare without a recommendation and locks payment until ready', () => {
    let state = addCustomer(opened());
    const customer = state.day.customers[0];
    customer.service = createArrivalService(customer, CONFIG.recommendationChance);
    expect(customer.service.stage).toBe('ordered');
    expect(dispatchCommand(state, { type: 'ask', id: customer.id, topic: 'taste' }).error).toBe(
      true,
    );
    const before = structuredClone(state);
    state = act(state, { type: 'brew', id: customer.id });
    expect(state.day.customers[0].service.stage).toBe('preparing');
    expect(state.cash).toBe(before.cash);
    state = tick(state, BREW_SECONDS.standard - 1);
    expect(dispatchCommand(state, { type: 'serve', id: customer.id }).error).toBe(true);
    state = tick(state, 1);
    state = act(state, { type: 'serve', id: customer.id });
    expect(state.day.receipts[0]).toMatchObject({
      product: customer.product,
      price: customer.price,
    });
    expect(state.cash).toBe(before.cash + customer.price);
  });

  it('varies greetings by personality and stable customer identity without drawing economic RNG', () => {
    const greetings = archetypes.map(
      (archetype) => createService({ id: 'same-identity', archetype }).line,
    );
    expect(new Set(greetings).size).toBe(archetypes.length);
    const variants = ['guest-a', 'guest-b', 'guest-c'].map(
      (id) => createService({ id, archetype: 'student' }).line,
    );
    expect(new Set(variants).size).toBe(3);
    expect(createService({ id: 'guest-a', archetype: 'student' })).toEqual(
      createService({ id: 'guest-a', archetype: 'student' }),
    );
  });

  it('records each answer once without advancing time, taking payment, or farming reputation', () => {
    const initial = addCustomer(opened());
    let state = act(initial, { type: 'ask', id: 'guest-1', topic: 'taste' });
    expect(state.day.customers[0].service).toMatchObject({
      askedTaste: true,
      askedBudget: false,
      stage: 'greeting',
    });
    expect(state.day.customers[0].service.line).toContain('Cocoa Latte');
    const repeated = dispatchCommand(state, { type: 'ask', id: 'guest-1', topic: 'taste' });
    expect(repeated.error).toBe(true);
    expect(repeated.state).toBe(state);
    state = act(state, { type: 'ask', id: 'guest-1', topic: 'budget' });
    expect(state.day.customers[0].service.askedBudget).toBe(true);
    expect(state.day.customers[0].service.line).toContain('12.000');
    const repeatedBudget = dispatchCommand(state, { type: 'ask', id: 'guest-1', topic: 'budget' });
    expect(repeatedBudget.error).toBe(true);
    expect(repeatedBudget.state).toBe(state);
    expect(state.cash).toBe(initial.cash);
    expect(state.reputation).toBe(initial.reputation);
    expect(state.inventory).toEqual(initial.inventory);
    expect(state.day.elapsed).toBe(initial.day.elapsed);
    expect(state.rng).toBe(initial.rng);
  });

  it('rejects an over-budget offer without charging or silently changing the existing choice', () => {
    const initial = addCustomer(opened({ 'coffee-latte': 13_000 }), 'guest-1', { budget: 9_000 });
    const state = act(initial, { type: 'offer', id: 'guest-1', product: 'coffee-latte' });
    expect(state.day.customers[0]).toMatchObject({
      product: 'cocoa-latte',
      price: 9_000,
      patience: 41,
      service: { stage: 'greeting', refusals: 1, askedBudget: true },
    });
    expect(state.day.customers[0].service.line).toContain('13.000');
    expect(state.cash).toBe(initial.cash);
    expect(state.inventory).toEqual(initial.inventory);
    expect(state.day.receipts).toHaveLength(0);
    expect(state.reputation).toBe(initial.reputation);
  });

  it('loses the customer and one reputation point after three unsuitable budget offers', () => {
    let state = addCustomer(opened({ 'coffee-latte': 13_000 }), 'guest-1', { budget: 9_000 });
    const initial = structuredClone(state);
    for (let n = 0; n < 3; n++) {
      state = act(state, { type: 'offer', id: 'guest-1', product: 'coffee-latte' });
    }
    expect(state.day.customers).toHaveLength(0);
    expect(state.day.missed.low_interest).toBe(1);
    expect(state.reputation).toBe(initial.reputation - 1);
    expect(state.cash).toBe(initial.cash);
    expect(state.inventory).toEqual(initial.inventory);
    expect(state.day.receipts).toHaveLength(0);
  });

  it('locks the accepted product and quoted price until the player explicitly changes the order', () => {
    const initial = addCustomer(opened({ 'matcha-latte': 11_500 }));
    let state = ordered(initial, 'guest-1', 'matcha-latte');
    expect(state.day.customers[0]).toMatchObject({
      product: 'matcha-latte',
      price: 11_500,
      service: { stage: 'ordered' },
    });
    expect(state.cash).toBe(initial.cash);
    expect(state.inventory).toEqual(initial.inventory);
    const repeatedOffer = dispatchCommand(state, {
      type: 'offer',
      id: 'guest-1',
      product: 'coffee-latte',
    });
    expect(repeatedOffer.error).toBe(true);
    expect(repeatedOffer.state).toBe(state);
    state = act(state, { type: 'change_order', id: 'guest-1' });
    state = ordered(state, 'guest-1', 'cocoa-latte');
    expect(state.day.customers[0]).toMatchObject({
      product: 'cocoa-latte',
      price: 9_000,
      service: { stage: 'ordered' },
    });
  });

  it('does not offer disabled recipes', () => {
    const initial = addCustomer(opened());
    initial.menu['matcha-latte'].active = false;
    const result = dispatchCommand(initial, {
      type: 'offer',
      id: 'guest-1',
      product: 'matcha-latte',
    });
    expect(result.error).toBe(true);
    expect(result.state).toBe(initial);
  });
});

describe('brewing and handoff lifecycle', () => {
  it('requires agreement before brewing and a finished drink before taking payment', () => {
    let state = addCustomer(opened());
    for (const command of [
      { type: 'brew', id: 'guest-1' },
      { type: 'serve', id: 'guest-1' },
    ] satisfies Command[]) {
      const result = dispatchCommand(state, command);
      expect(result.error).toBe(true);
      expect(result.state).toBe(state);
    }
    state = ordered(state);
    const premature = dispatchCommand(state, { type: 'serve', id: 'guest-1' });
    expect(premature.error).toBe(true);
    expect(premature.state).toBe(state);
    state = act(state, { type: 'brew', id: 'guest-1' });
    for (const command of [
      { type: 'brew', id: 'guest-1' },
      { type: 'change_order', id: 'guest-1' },
      { type: 'serve', id: 'guest-1' },
    ] satisfies Command[]) {
      const result = dispatchCommand(state, command);
      expect(result.error).toBe(true);
      expect(result.state).toBe(state);
    }
  });

  it('makes an order ready only after six business seconds', () => {
    const seconds = BREW_SECONDS.standard;
    const initial = ordered(addCustomer(opened()));
    let state = act(initial, { type: 'brew', id: 'guest-1' });
    expect(state.day.customers[0].service).toMatchObject({
      stage: 'preparing',
      style: 'standard',
      startedAt: 0,
      readyAt: seconds,
    });
    state = tick(state, seconds - 1);
    expect(state.day.customers[0].service.stage).toBe('preparing');
    expect(dispatchCommand(state, { type: 'serve', id: 'guest-1' }).error).toBe(true);
    state = tick(state, 1);
    expect(state.day.customers[0].service.stage).toBe('ready');
    expect(state.cash).toBe(initial.cash);
    expect(state.inventory).toEqual(initial.inventory);
    expect(state.day.receipts).toHaveLength(0);
    expect(state.reputation).toBe(initial.reputation);
  });

  it('takes payment and awards standard reputation only at handoff', () => {
    const state = prepared();
    expect(state.reputation).toBe(CONFIG.initialReputation);
    const sale = dispatchCommand(state, { type: 'serve', id: 'guest-1' });
    expect(sale.error).toBeFalsy();
    expect(sale.reaction?.reputationDelta).toBe(1);
    expect(sale.reaction?.contribution).toBe(3_000);
    expect(sale.receipt?.hpp).toBe(6_000);
    expect(sale.state.cash).toBe(state.cash + 9_000);
  });

  it('rewards remembering a discovered preference once, when that drink is delivered', () => {
    let state = addCustomer(opened());
    state = act(state, { type: 'ask', id: 'guest-1', topic: 'taste' });
    state = ordered(state);
    state = act(state, { type: 'brew', id: 'guest-1' });
    state = tick(state, 6);
    expect(state.reputation).toBe(CONFIG.initialReputation);
    const sale = dispatchCommand(state, { type: 'serve', id: 'guest-1' });
    expect(sale.reaction?.reputationDelta).toBe(2);
    const duplicate = dispatchCommand(sale.state, { type: 'serve', id: 'guest-1' });
    expect(duplicate.error).toBe(true);
    expect(duplicate.state).toBe(sale.state);
    expect(sale.state.day.receipts).toHaveLength(1);
  });

  it('keeps the food blogger reputation impact distinct', () => {
    let state = addCustomer(opened(), 'blogger-1', {
      archetype: 'blogger',
      product: 'matcha-latte',
      price: 10_000,
    });
    state = act(state, { type: 'ask', id: 'blogger-1', topic: 'taste' });
    state = ordered(state, 'blogger-1', 'matcha-latte');
    state = act(state, { type: 'brew', id: 'blogger-1' });
    state = tick(state, 6);
    const result = dispatchCommand(state, { type: 'serve', id: 'blogger-1' });
    expect(result.reaction).toMatchObject({ archetype: 'blogger', reputationDelta: 4 });
    expect(result.receipt?.hpp).toBe(6_300);
  });

  it('keeps the full service flow available to customers already waiting at closing', () => {
    let state = addCustomer(opened());
    state = act(state, { type: 'close' });
    state = act(state, { type: 'ask', id: 'guest-1', topic: 'budget' });
    state = ordered(state);
    state = act(state, { type: 'brew', id: 'guest-1' });
    state = tick(state, BREW_SECONDS.standard);
    state = act(state, { type: 'serve', id: 'guest-1' });
    state = tick(state, 1);
    expect(state.day.phase).toBe('report');
    expect(state.reports[0]).toMatchObject({ customers: 1, revenue: 9_000, hpp: 6_000 });
    expect(state.cash + inventoryValue(state.inventory)).toBe(
      CONFIG.initialCash + state.reports[0].profit,
    );
  });
});

describe('ingredient reservations and expired orders', () => {
  function lastCup(): Session {
    let state = addCustomer(opened(), 'first');
    state = addCustomer(state, 'second');
    state.inventory.cup[0].consumed = 19;
    state = ordered(state, 'first', 'cocoa-latte');
    return ordered(state, 'second', 'matcha-latte');
  }

  it('reserves shared ingredients for both preparing and ready drinks without consuming them early', () => {
    const initial = lastCup();
    let state = act(initial, { type: 'brew', id: 'first' });
    expect(stock(state.inventory, 'cup')).toBe(1);
    expect(brewingCapacity(state, 'matcha-latte')).toBe(0);
    expect(brewingCapacity(state, 'cocoa-latte', 'first')).toBe(1);
    for (let elapsed = 0; elapsed <= BREW_SECONDS.standard; elapsed++) {
      const second = dispatchCommand(state, { type: 'brew', id: 'second' });
      expect(second.error).toBe(true);
      expect(second.state).toBe(state);
      if (elapsed < BREW_SECONDS.standard) state = tick(state, 1);
    }
    expect(state.day.customers[0].service.stage).toBe('ready');
    expect(state.inventory).toEqual(initial.inventory);
    expect(state.cash).toBe(initial.cash);
    state = act(state, { type: 'serve', id: 'first' });
    expect(stock(state.inventory, 'cup')).toBe(0);
    expect(dispatchCommand(state, { type: 'brew', id: 'second' }).error).toBe(true);
  });

  it('releases reservations when patience expires during brewing, without inventing a sale', () => {
    let state = lastCup();
    state.day.customers[0].patience = 2;
    const before = structuredClone(state);
    state = act(state, { type: 'brew', id: 'first' });
    state = tick(state, 2);
    expect(state.day.customers.map((customer) => customer.id)).toEqual(['second']);
    expect(state.day.missed.wait_timeout).toBe(1);
    expect(state.reputation).toBe(before.reputation - 1);
    expect(state.cash).toBe(before.cash);
    expect(state.inventory).toEqual(before.inventory);
    expect(state.day.receipts).toHaveLength(0);
    expect(brewingCapacity(state, 'matcha-latte')).toBe(1);
    state = act(state, { type: 'brew', id: 'second' });
    state = tick(state, BREW_SECONDS.standard);
    state = act(state, { type: 'serve', id: 'second' });
    expect(state.day.receipts).toHaveLength(1);
    expect(stock(state.inventory, 'cup')).toBe(0);
  });
});

describe('repeatable interactive day simulation', () => {
  it('replays conversations, recommendations, brewing, and sales while conserving business value', () => {
    function run(): Session {
      let state = act(createSession(4321, 'interactive-replay'), {
        type: 'buy',
        cart: STARTER_CART,
      });
      state = act(state, { type: 'open' });
      const arrivals = { greeting: 0, ordered: 0 };
      const seen = new Set<string>();
      for (let seconds = 0; seconds < 220 && state.day.phase !== 'report'; seconds++) {
        state = act(state, { type: 'tick' });
        for (const id of state.day.customers.map((customer) => customer.id)) {
          let customer = state.day.customers.find((candidate) => candidate.id === id)!;
          if (!seen.has(id)) {
            seen.add(id);
            if (customer.service.stage === 'greeting' || customer.service.stage === 'ordered')
              arrivals[customer.service.stage]++;
          }
          if (customer.service.stage === 'greeting') {
            state = act(state, { type: 'ask', id, topic: 'taste' });
            const favorite = PEOPLE[customer.archetype as Archetype].favorite;
            const product =
              state.menu[favorite].price <= customer.budget && brewingCapacity(state, favorite) > 0
                ? favorite
                : customer.product;
            if (brewingCapacity(state, product) > 0) {
              state = act(state, { type: 'offer', id, product });
            }
          }
          customer = state.day.customers.find((candidate) => candidate.id === id)!;
          if (
            customer.service.stage === 'ordered' &&
            brewingCapacity(state, customer.product, id) > 0
          ) {
            state = act(state, { type: 'brew', id });
          } else if (customer.service.stage === 'ready') {
            state = act(state, { type: 'serve', id });
          }
        }
      }
      expect(state.day.phase).toBe('report');
      expect(arrivals.greeting).toBeGreaterThan(0);
      expect(arrivals.ordered).toBeGreaterThan(arrivals.greeting);
      expect(state.reports[0].customers).toBeGreaterThan(0);
      expect(state.day.customers).toHaveLength(0);
      expect(state.cash + inventoryValue(state.inventory)).toBe(
        CONFIG.initialCash + state.reports[0].profit,
      );
      return state;
    }
    expect(run()).toEqual(run());
  });
});
