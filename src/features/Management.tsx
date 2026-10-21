import { useState } from 'react';
import { useStore } from 'zustand';
import {
  INGREDIENTS,
  PRODUCTS,
  STARTER_CART,
  ingredientIds,
  productIds,
  type IngredientId,
  type ProductId,
} from '../data/catalog';
import { capacity, inventoryValue, recipeCost, stock } from '../domain/inventory/inventory';
import { hasCalculatedHpp, hppFeedback, parseHppInput } from '../domain/pricing/hpp';
import { quotePrice } from '../domain/promotion/promotion';
import { gameStore } from '../store/gameStore';
import { Icon, type IconName } from '../components/Icon';
import { money, number } from '../utils/format';

export const ingredientIcon: Record<IngredientId, IconName> = {
  matcha: 'leaf',
  coffee: 'coffee',
  cocoa: 'sprout',
  milk: 'milk',
  cup: 'cup',
};

export function ProductArt({ id, small = false }: { id: ProductId; small?: boolean }) {
  return (
    <img
      className={`product-art ${small ? 'small' : ''}`}
      src={`/assets/products/${id}.svg`}
      alt=""
    />
  );
}

export function SupplierPanel() {
  const session = useStore(gameStore, (s) => s.session)!;
  const dispatch = useStore(gameStore, (s) => s.dispatch);
  const [cart, setCart] = useState<Partial<Record<IngredientId, number>>>({});
  const total = ingredientIds.reduce((n, id) => n + (cart[id] ?? 0) * INGREDIENTS[id].cost, 0);
  const editable = session.day.phase === 'preparation';
  return (
    <>
      <div className="panel-intro">
        <p>
          <span>
            Purchases add to your stock. Ingredient costs become COGS when a drink is sold.
          </span>
        </p>
        <div className="mini-balance">
          <span>Available cash</span>
          <strong>{money(session.cash)}</strong>
        </div>
      </div>
      {!editable && (
        <div className="notice">
          The supplier will be available during preparation for the next day.
        </div>
      )}
      <button
        className="starter-bundle"
        disabled={!editable}
        onClick={() => setCart({ ...STARTER_CART })}
      >
        <span className="round-icon">
          <Icon name="basket" />
        </span>
        <span>
          <strong>Cafe starter bundle</strong>
          <small>All ingredients · 4 liters of milk · 20 cups</small>
        </span>
        <b>Rp240.000</b>
        <Icon name="plus" />
      </button>
      <div className="supplier-list">
        {ingredientIds.map((id) => {
          const item = INGREDIENTS[id];
          return (
            <div className="supplier-row" key={id}>
              <div
                className="ingredient-art"
                style={{ background: `${item.color}20`, color: item.color }}
              >
                <img src={`/assets/ingredients/${id}.svg`} alt="" />
              </div>
              <div className="ingredient-info">
                <h3>{item.name}</h3>
                <p>
                  {number(item.pack)} {item.unit} / pack
                </p>
                <small>
                  Stock: {number(stock(session.inventory, id))} {item.unit}
                </small>
              </div>
              <strong>{money(item.cost)}</strong>
              <div className="stepper">
                <button
                  aria-label={`Decrease ${item.name}`}
                  disabled={!editable || !cart[id]}
                  onClick={() => setCart({ ...cart, [id]: Math.max(0, (cart[id] ?? 0) - 1) })}
                >
                  <Icon name="minus" size={15} />
                </button>
                <span aria-live="polite">{cart[id] ?? 0}</span>
                <button
                  aria-label={`Increase ${item.name}`}
                  disabled={!editable || (cart[id] ?? 0) >= 100}
                  onClick={() => setCart({ ...cart, [id]: (cart[id] ?? 0) + 1 })}
                >
                  <Icon name="plus" size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="purchase-footer">
        <div>
          <span>Purchase total</span>
          <strong>{money(total)}</strong>
          <small>Cash after purchase: {money(session.cash - total)}</small>
        </div>
        <button
          className="button primary"
          disabled={!editable || total === 0 || total > session.cash}
          onClick={() => {
            if (dispatch({ type: 'buy', cart })) setCart({});
          }}
        >
          <Icon name="bag" size={18} /> Buy ingredients
        </button>
      </div>
      {total > session.cash && (
        <p className="error-text">Not enough cash. Reduce the number of packs.</p>
      )}
      {total > 0 && session.cash >= total && session.cash - total < session.day.operatingCost && (
        <p className="error-text">Reserve {money(session.day.operatingCost)} to open the cafe.</p>
      )}
    </>
  );
}

export function InventoryPanel() {
  const session = useStore(gameStore, (s) => s.session)!;
  return (
    <>
      <div className="panel-intro">
        <p>What is left in stock today.</p>
        <div className="mini-balance">
          <span>Inventory value</span>
          <strong>{money(inventoryValue(session.inventory))}</strong>
        </div>
      </div>
      <div className="inventory-grid">
        {ingredientIds.map((id) => (
          <div className="inventory-item" key={id}>
            <span className="round-icon">
              <Icon name={ingredientIcon[id]} />
            </span>
            <strong>{INGREDIENTS[id].name}</strong>
            <h3>
              {number(stock(session.inventory, id))} <small>{INGREDIENTS[id].unit}</small>
            </h3>
            <span className={`tag ${stock(session.inventory, id) === 0 ? 'empty' : 'green'}`}>
              {stock(session.inventory, id) === 0 ? 'Out of stock' : 'In stock'}
            </span>
          </div>
        ))}
      </div>
      <h3 className="subheading">Drinks you can make with current stock</h3>
      {productIds.map((id) => (
        <div className="simple-row" key={id}>
          <span>{PRODUCTS[id].name}</span>
          <strong>{capacity(session.inventory, id)} servings</strong>
        </div>
      ))}
      <div className="learning-note">
        <Icon name="book" />
        <p>
          All drinks share milk and cups. The figures above show the capacity for each drink
          separately; they cannot be added together.
        </p>
      </div>
      <button
        className="button primary full"
        onClick={() => gameStore.getState().openPanel('supplier')}
      >
        <Icon name="plus" size={18} /> Restock ingredients
      </button>
    </>
  );
}

function PriceEditor({ id }: { id: ProductId }) {
  const session = useStore(gameStore, (s) => s.session)!;
  const dispatch = useStore(gameStore, (s) => s.dispatch);
  const [price, setPrice] = useState(String(session.menu[id].price));
  const readOnly = useStore(gameStore, (s) => s.readOnly);
  const [answer, setAnswer] = useState(() =>
    hasCalculatedHpp(session, id) ? String(session.menu[id].calculatedHpp) : '',
  );
  const [feedback, setFeedback] = useState('');
  const cost = recipeCost(session.inventory, id);
  const editable = session.day.phase === 'preparation' && !readOnly;
  const parsedAnswer = parseHppInput(answer);
  const verified = hasCalculatedHpp(session, id) && parsedAnswer === cost.hpp;
  const value = price.trim() === '' ? NaN : Number(price);
  const valid = Number.isSafeInteger(value) && value > 0 && value <= 100_000;
  const netPrice = valid ? quotePrice({ ...session.menu[id], price: value }).net : NaN;
  const checkHpp = () => {
    const problem = hppFeedback(parsedAnswer ?? NaN, cost.hpp);
    if (problem) {
      setFeedback(problem);
      return;
    }
    if (dispatch({ type: 'calculate_hpp', product: id, answer: parsedAnswer! })) setFeedback('');
    else setFeedback('Your calculation has not been saved. Check the save status and try again.');
  };
  return (
    <article className="price-editor">
      <div className="price-product">
        <ProductArt id={id} />
        <div>
          <h3>{PRODUCTS[id].name}</h3>
          <p>{PRODUCTS[id].description}</p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={session.menu[id].active}
              disabled={!editable}
              onChange={() => dispatch({ type: 'toggle', product: id })}
            />{' '}
            Available on the menu
          </label>
        </div>
      </div>
      <div className="cost-detail hpp-worksheet">
        <h4>
          <Icon name="calculator" size={17} /> 1. Read each ingredient cost
        </h4>
        {cost.lines.map((l) => (
          <div className="simple-row" key={l.ingredient}>
            <span>
              {INGREDIENTS[l.ingredient].name} · {l.quantity} {INGREDIENTS[l.ingredient].unit}
              <small>
                {money(INGREDIENTS[l.ingredient].cost)} × {l.quantity}/
                {INGREDIENTS[l.ingredient].pack} = {money(l.cost)}
              </small>
            </span>
            <strong>{money(l.cost)}</strong>
          </div>
        ))}
        <p>
          COGS per serving = ingredient costs + packaging. Add the three costs above, then enter
          your answer.
        </p>
        {cost.estimated && (
          <p className="muted">
            Estimated using supplier prices because there are not enough ingredients for one
            serving.
          </p>
        )}
      </div>
      <form
        className={`hpp-calculation ${verified ? 'verified' : ''}`}
        onSubmit={(event) => {
          event.preventDefault();
          if (editable) checkHpp();
        }}
      >
        <label htmlFor={`hpp-${id}`} className="field-label">
          2. Calculate COGS per serving
        </label>
        <div className="hpp-answer-row">
          <div className="money-input">
            <span>Rp</span>
            <input
              id={`hpp-${id}`}
              aria-label={`COGS per serving ${PRODUCTS[id].name}`}
              aria-describedby={`hpp-feedback-${id}`}
              aria-invalid={!!feedback}
              inputMode="numeric"
              type="text"
              autoComplete="off"
              placeholder="Enter your calculated total"
              value={answer}
              disabled={!editable}
              onChange={(e) => {
                setAnswer(e.target.value);
                setFeedback('');
              }}
            />
          </div>
          <button
            type="submit"
            className="button secondary"
            disabled={!editable || !answer.trim() || verified}
          >
            <Icon name={verified ? 'check' : 'calculator'} size={16} />
            {verified ? 'COGS verified' : 'Check COGS'}
          </button>
        </div>
        <p
          id={`hpp-feedback-${id}`}
          className={feedback ? 'error-text' : 'hpp-feedback'}
          role="status"
        >
          {feedback ||
            (verified
              ? 'Correct! Use your calculated COGS to help set a selling price.'
              : 'You calculate the total COGS. Trying an answer does not cost cash or reputation.')}
        </p>
      </form>
      <div className="price-fields manual-hpp-price">
        <label>
          <span className="field-label">3. Set the selling price</span>
          <div className="money-input">
            <span>Rp</span>
            <input
              aria-label={`Price of ${PRODUCTS[id].name}`}
              inputMode="numeric"
              type="number"
              min="1"
              max="100000"
              step="100"
              value={price}
              disabled={!editable || !verified}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
        </label>
        <button
          className="button secondary"
          disabled={!editable || !verified || !valid || value === session.menu[id].price}
          onClick={() => dispatch({ type: 'price', product: id, price: value })}
        >
          Save price
        </button>
      </div>
      {verified && (
        <div className={`contribution ${valid && netPrice < cost.hpp ? 'loss' : ''}`}>
          <span>
            {valid && netPrice < cost.hpp ? 'Loss' : 'Profit'} per cup before operating costs
            {session.menu[id].discountPercent ? ' after discount' : ''}
          </span>
          <strong>{valid ? money(Math.abs(netPrice - cost.hpp)) : '—'}</strong>
        </div>
      )}
      <p className="hpp-feedback">
        {verified
          ? 'Gross profit = discounted price − your calculated COGS. Operating costs are included in the daily report.'
          : 'Check your COGS first to change prices and see the profit or loss per cup.'}
      </p>
      {!!session.menu[id].discountPercent && (
        <p className="hpp-feedback">
          Saved discount: {session.menu[id].discountPercent}%. Customer pays{' '}
          {valid ? money(netPrice) : '—'} at the selling price above.{' '}
          <button
            className="text-button"
            onClick={() => gameStore.getState().openPanel('promotion')}
          >
            Manage discounts
          </button>
        </p>
      )}
      {verified && valid && netPrice < cost.hpp && (
        <p className="error-text">
          You can choose this price, but each sale makes a loss even before operating costs.
        </p>
      )}
      {verified && !valid && (
        <p className="error-text">Enter a whole Rupiah price from Rp1 to Rp100.000.</p>
      )}
      {!editable && (
        <p className="notice">
          You can update COGS calculations and prices during preparation in the main game tab.
        </p>
      )}
    </article>
  );
}
export function PricingPanel() {
  return (
    <>
      <p className="muted panel-description">
        Add the ingredient costs to find COGS (Cost of Goods Sold) per serving, check your answer,
        then set a selling price. Prices are locked while the cafe is open.
      </p>
      {productIds.map((id) => (
        <PriceEditor key={id} id={id} />
      ))}
    </>
  );
}
