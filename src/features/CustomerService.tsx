import { useStore } from 'zustand';
import {
  CHARACTER_ASSETS,
  INGREDIENTS,
  PEOPLE,
  PRODUCTS,
  productIds,
  type Archetype,
} from '../data/catalog';
import {
  BREW_SECONDS,
  brewingCapacity,
  customerSpeech,
  remainingPatience,
} from '../domain/customer/service';
import { recipeCost } from '../domain/inventory/inventory';
import type { Customer } from '../domain/types';
import { gameStore } from '../store/gameStore';
import { Icon } from '../components/Icon';
import { money } from '../utils/format';
import { quotePrice } from '../domain/promotion/promotion';

const stages = {
  greeting: 'Wants a recommendation',
  ordered: 'Order accepted',
  preparing: 'Preparing drink',
  ready: 'Ready to serve',
};

export function CounterMenu() {
  const session = useStore(gameStore, (s) => s.session)!;
  return (
    <section className="counter-menu">
      <div>
        <span className="eyebrow">MENU BOARD</span>
        <span>The prices you offer</span>
      </div>
      <div className="counter-menu-grid">
        {productIds.map((id) => (
          <article key={id}>
            <img src={`/assets/products/${id}.svg`} alt="" />
            <strong>{PRODUCTS[id].name}</strong>
            <b>{money(quotePrice(session.menu[id]).net)}</b>
            {!!session.menu[id].discountPercent && (
              <small className="promo-label">
                Discount {session.menu[id].discountPercent}% · from {money(session.menu[id].price)}
              </small>
            )}
            <small>COGS {money(recipeCost(session.inventory, id).hpp)}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function Portrait({ archetype, className = '' }: { archetype: Archetype; className?: string }) {
  return (
    <span className={`service-portrait ${className}`}>
      <img src={`/assets/characters/${CHARACTER_ASSETS[archetype]}.png`} alt="" />
    </span>
  );
}

function selected(customers: Customer[], id: string | null) {
  return customers.find((c) => c.id === id) ?? customers[0];
}

export function CustomerBubbles() {
  const { session, selectedCustomerId, selectCustomer, lastReaction } = useStore(gameStore);
  if (!session) return null;
  const customer = selected(session.day.customers, selectedCustomerId);
  const others = session.day.customers.filter((c) => c.id !== customer?.id);
  return (
    <>
      {customer ? (
        <button
          className="service-scene-bubble"
          onClick={() => selectCustomer(customer.id)}
          aria-label={`Talk to ${customer.name} in the cafe`}
        >
          <span className="bubble-person">
            <Icon name="chat" size={13} />
            {customer.name} · {stages[customer.service.stage]}
          </span>
          <span className="bubble-speech">“{customerSpeech(customer, session.day.elapsed)}”</span>
        </button>
      ) : (
        lastReaction && (
          <div className="service-scene-bubble farewell">
            <span className="bubble-person">{lastReaction.name} says goodbye</span>
            <span className="bubble-speech">“{lastReaction.line}”</span>
          </div>
        )
      )}
      <div className="scene-queue-bubbles">
        {others.map((c) => (
          <button
            key={c.id}
            onClick={() => selectCustomer(c.id)}
            aria-label={`Select ${c.name} in the queue`}
          >
            <Icon name={c.service.stage === 'ready' ? 'cup' : 'chat'} size={13} />
            <span>{c.name}</span>
            <small>{stages[c.service.stage]}</small>
          </button>
        ))}
      </div>
    </>
  );
}

export function ServiceCounter() {
  const store = useStore(gameStore);
  const session = store.session!;
  const { day } = session;
  const customer = selected(day.customers, store.selectedCustomerId);
  const blocked = store.paused || store.readOnly || store.saveStatus === 'failed' || !!store.panel;
  const reaction = store.lastReaction;
  const stage = customer?.service.stage;
  const remaining = customer ? remainingPatience(customer, day.elapsed) : 0;
  const cost = customer ? recipeCost(session.inventory, customer.product) : null;
  const prepElapsed =
    customer?.service.startedAt != null ? day.elapsed - customer.service.startedAt : 0;
  const prepDuration =
    customer?.service.readyAt != null && customer.service.startedAt != null
      ? customer.service.readyAt - customer.service.startedAt
      : 1;
  return (
    <div className="service-counter">
      <h2>Serve Customers</h2>
      <p className="service-intro">Find out what customers want, then prepare their drinks.</p>
      {reaction && (
        <div className="service-reaction" role="status">
          <Portrait archetype={reaction.archetype} />
          <div>
            <strong>{reaction.name} says…</strong>
            <p>“{reaction.line}”</p>
            <small>
              {money(reaction.contribution)} before operating costs · reputation{' '}
              {reaction.reputationDelta >= 0 ? '+' : ''}
              {reaction.reputationDelta}
            </small>
          </div>
          <button
            className="reaction-close"
            aria-label="Dismiss customer feedback"
            onClick={() => gameStore.setState({ lastReaction: null })}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      )}
      {day.customers.length > 0 && (
        <div className="service-queue" role="group" aria-label="Select a customer">
          {day.customers.map((c) => (
            <button
              className={customer?.id === c.id ? 'selected' : ''}
              key={c.id}
              aria-pressed={customer?.id === c.id}
              aria-label={`Talk to ${c.name}`}
              onClick={() => store.selectCustomer(c.id)}
            >
              <Portrait archetype={c.archetype} />
              <span>
                <strong>{c.name}</strong>
                <small>
                  {c.service.stage === 'ready'
                    ? 'Drink ready!'
                    : `${remainingPatience(c, day.elapsed)} sec`}
                </small>
              </span>
              {c.service.stage === 'ready' && <span className="queue-ready" />}
            </button>
          ))}
        </div>
      )}
      {!customer ? (
        <div className="service-empty">
          <div className="service-preview">
            <span>
              <Icon name="chat" size={14} />
              Listen
            </span>
            <span>
              <Icon name="coffee" size={14} />
              Prepare
            </span>
            <span>
              <Icon name="heart" size={14} />
              Serve
            </span>
          </div>
        </div>
      ) : (
        <>
          <div className="service-person">
            <Portrait archetype={customer.archetype} />
            <div>
              <strong>{customer.name}</strong>
              <span>{PEOPLE[customer.archetype].label}</span>
            </div>
            <span className={`service-stage ${stage === 'ready' ? 'ready' : ''}`}>
              {stages[stage!]}
            </span>
          </div>
          <div className={`service-patience ${remaining <= 12 ? 'urgent' : ''}`}>
            <div>
              <span>
                <Icon name="clock" size={12} /> Patience
              </span>
              <strong>{remaining} seconds</strong>
            </div>
            <progress
              aria-label={`Patience ${customer.name}`}
              max={customer.patience}
              value={remaining}
            />
          </div>
          <blockquote className="service-dialogue" aria-live="polite">
            <Icon name="chat" size={18} />
            <p>“{customerSpeech(customer, day.elapsed)}”</p>
          </blockquote>
          <div className="service-known">
            {customer.service.askedTaste && (
              <span>
                <Icon name="heart" size={12} /> Likes{' '}
                {PRODUCTS[PEOPLE[customer.archetype].favorite].short}
              </span>
            )}
            {customer.service.askedBudget && (
              <span>
                <Icon name="wallet" size={12} /> Max. {money(customer.budget)}
              </span>
            )}
          </div>
          {stage === 'greeting' && (
            <>
              <div className="service-questions">
                <button
                  disabled={blocked || customer.service.askedTaste}
                  onClick={() => store.dispatch({ type: 'ask', id: customer.id, topic: 'taste' })}
                >
                  <Icon name={customer.service.askedTaste ? 'check' : 'heart'} size={14} />
                  {customer.service.askedTaste
                    ? 'Taste preference known'
                    : 'What flavor do you feel like?'}
                </button>
                <button
                  disabled={blocked || customer.service.askedBudget}
                  onClick={() => store.dispatch({ type: 'ask', id: customer.id, topic: 'budget' })}
                >
                  <Icon name={customer.service.askedBudget ? 'check' : 'wallet'} size={14} />
                  {customer.service.askedBudget ? 'Budget known' : 'What is your budget?'}
                </button>
              </div>
              <div className="offer-heading">
                <strong>Recommend a drink</strong>
                <small>Prices follow the current menu</small>
              </div>
              <div className="service-offers">
                {productIds.map((id) => {
                  const item = PRODUCTS[id];
                  const available = session.menu[id].active && brewingCapacity(session, id) > 0;
                  const overBudget =
                    customer.service.askedBudget &&
                    quotePrice(session.menu[id]).net > customer.budget;
                  return (
                    <button
                      key={id}
                      disabled={blocked || !available}
                      className={overBudget ? 'over-budget' : ''}
                      aria-label={`Offer ${item.name}`}
                      onClick={() =>
                        store.dispatch({ type: 'offer', id: customer.id, product: id })
                      }
                    >
                      <img src={`/assets/products/${id}.svg`} alt="" />
                      <span>
                        <strong>{item.name}</strong>
                        <small>
                          {!available
                            ? 'Ingredients unavailable'
                            : overBudget
                              ? 'Over the customer budget'
                              : customer.service.askedTaste &&
                                  id === PEOPLE[customer.archetype].favorite
                                ? 'Matches their taste · reputation bonus'
                                : `COGS ${money(recipeCost(session.inventory, id).hpp)}`}
                        </small>
                      </span>
                      <b>
                        {money(quotePrice(session.menu[id]).net)}
                        {!!session.menu[id].discountPercent && (
                          <small>Discount {session.menu[id].discountPercent}%</small>
                        )}
                      </b>
                      <Icon name="chevron" size={14} />
                    </button>
                  );
                })}
              </div>
              <p className="service-hint">
                Offers over budget reduce patience by 4 seconds. After three rejections, the
                customer leaves.
              </p>
            </>
          )}
          {stage !== 'greeting' && (
            <div className="agreed-order">
              <img src={`/assets/products/${customer.product}.svg`} alt="" />
              <div>
                <strong>{PRODUCTS[customer.product].name}</strong>
                <span>
                  Agreed price: {money(customer.price)} · COGS {money(cost!.hpp)}
                </span>
                <small>Margin per cup {money(customer.price - cost!.hpp)}</small>
                {!!customer.discount && (
                  <small>
                    Promo {customer.discountPercent}% · {money(customer.price + customer.discount)}{' '}
                    − {money(customer.discount)} = {money(customer.price)}
                  </small>
                )}
              </div>
              <Icon name="check" size={17} />
            </div>
          )}
          {stage === 'ordered' && (
            <>
              <div className="prepare-order">
                <button
                  className="button primary full"
                  disabled={blocked || brewingCapacity(session, customer.product, customer.id) < 1}
                  onClick={() => store.dispatch({ type: 'brew', id: customer.id })}
                >
                  <Icon name="coffee" size={20} />
                  Prepare Order
                </button>
                <p className="service-hint">
                  Takes {BREW_SECONDS.standard} seconds to prepare. You can serve other guests while
                  waiting.
                </p>
              </div>
              {brewingCapacity(session, customer.product, customer.id) < 1 && (
                <p className="service-hint warning">
                  Ingredients are reserved for another order. Try offering a different drink.
                </p>
              )}
              {brewingCapacity(session, customer.product, customer.id) < 1 && (
                <button
                  className="text-button change-order"
                  disabled={blocked}
                  onClick={() => store.dispatch({ type: 'change_order', id: customer.id })}
                >
                  Offer a replacement drink <Icon name="arrowRight" size={14} />
                </button>
              )}
            </>
          )}
          {(stage === 'preparing' || stage === 'ready') && (
            <div className={`brew-station ${stage === 'ready' ? 'is-ready' : ''}`}>
              <div className="brew-station-title">
                <Icon name={stage === 'ready' ? 'cup' : 'coffee'} size={20} />
                <strong>
                  {stage === 'ready' ? 'Your drink is ready to serve' : 'Preparing order…'}
                </strong>
                <span>
                  {stage === 'ready' ? (
                    <Icon name="check" size={17} />
                  ) : (
                    `${Math.max(0, customer.service.readyAt! - day.elapsed)} sec`
                  )}
                </span>
              </div>
              <progress
                max={prepDuration}
                value={Math.min(prepDuration, prepElapsed)}
                aria-label="Drink preparation progress"
              />
              <div className="brew-ingredients">
                {Object.entries(PRODUCTS[customer.product].recipe).map(([id, qty], i) => (
                  <span
                    key={id}
                    className={
                      stage === 'ready' || prepElapsed / prepDuration >= i / 3 ? 'done' : ''
                    }
                  >
                    <Icon name={i === 0 ? 'leaf' : i === 1 ? 'milk' : 'cup'} size={15} />
                    <strong>
                      {qty}
                      {INGREDIENTS[id as keyof typeof INGREDIENTS].unit === 'pcs'
                        ? ' cup'
                        : INGREDIENTS[id as keyof typeof INGREDIENTS].unit}
                    </strong>
                    <small>{INGREDIENTS[id as keyof typeof INGREDIENTS].name}</small>
                  </span>
                ))}
              </div>
              {stage === 'preparing' && (
                <p>The drink is being prepared. You can greet other guests while waiting.</p>
              )}
            </div>
          )}
          {stage === 'ready' && (
            <button
              className="button primary full handover"
              disabled={blocked}
              onClick={() => store.dispatch({ type: 'serve', id: customer.id })}
            >
              <Icon name="cup" size={18} />
              Serve to {customer.name}
              <Icon name="arrowRight" size={17} />
            </button>
          )}
          {blocked && store.paused && (
            <p className="service-hint paused">
              <Icon name="pause" size={13} />
              Press Resume in the cafe to continue serving.
            </p>
          )}
        </>
      )}
    </div>
  );
}
