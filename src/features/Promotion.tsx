import { useState } from 'react';
import { useStore } from 'zustand';
import { CONFIG, PRODUCTS, productIds, type ProductId } from '../data/catalog';
import { quotePrice } from '../domain/promotion/promotion';
import { hasCalculatedHpp } from '../domain/pricing/hpp';
import { recipeCost } from '../domain/inventory/inventory';
import { gameStore } from '../store/gameStore';
import { Icon } from '../components/Icon';
import { ProductArt } from './Management';
import { money } from '../utils/format';

function PromotionEditor({ id }: { id: ProductId }) {
  const store = useStore(gameStore);
  const session = store.session!;
  const item = session.menu[id];
  const savedPercent = item.discountPercent ?? 0;
  const [input, setInput] = useState(String(savedPercent));
  const percent = input.trim() ? Number(input) : NaN;
  const valid =
    Number.isSafeInteger(percent) && percent >= 0 && percent <= CONFIG.maxDiscountPercent;
  const editable =
    session.day.phase === 'preparation' && !store.readOnly && store.saveStatus !== 'failed';
  const quote = valid ? quotePrice({ price: item.price, discountPercent: percent }) : null;
  const cost = recipeCost(session.inventory, id).hpp;
  const knownHpp = hasCalculatedHpp(session, id);
  return (
    <article className="promotion-card">
      <div className="price-product">
        <ProductArt id={id} small />
        <div>
          <h3>{PRODUCTS[id].name}</h3>
          <p>{item.active ? 'Item enabled' : 'Item disabled · discount applies when enabled'}</p>
          <span className="tag green">
            {savedPercent ? `Saved discount: ${savedPercent}%` : 'No discount'}
          </span>
        </div>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (valid && editable) store.dispatch({ type: 'promotion', product: id, percent });
        }}
      >
        <label className="field-label" htmlFor={`promo-${id}`}>
          Discount {PRODUCTS[id].name} (%)
        </label>
        <div className="hpp-answer-row">
          <div className="money-input">
            <input
              id={`promo-${id}`}
              type="number"
              inputMode="numeric"
              min="0"
              max={CONFIG.maxDiscountPercent}
              step="1"
              value={input}
              disabled={!editable}
              onChange={(event) => setInput(event.target.value)}
            />
            <span className="percent-suffix">%</span>
          </div>
          <button
            className="button primary"
            type="submit"
            disabled={!editable || !valid || percent === savedPercent}
          >
            Save discount
          </button>
        </div>
        <p className="hpp-feedback">
          Set 0% to turn off the discount. Maximum {CONFIG.maxDiscountPercent}%.{' '}
          {valid && percent !== savedPercent
            ? 'This preview has not been saved.'
            : 'This setting stays active until you change it during preparation.'}
        </p>
      </form>
      {quote ? (
        <>
          <div className="promo-math">
            <div>
              <span>Regular price</span>
              <strong>{money(quote.gross)}</strong>
            </div>
            <div>
              <span>
                Discount · {percent}% × {money(quote.gross)}
              </span>
              <strong>−{money(quote.discount)}</strong>
            </div>
            <div className="promo-net">
              <span>Customer pays</span>
              <strong>{money(quote.net)}</strong>
            </div>
          </div>
          {knownHpp ? (
            <div className={`contribution ${quote.net < cost ? 'loss' : ''}`}>
              <span>
                {quote.net < cost ? 'Loss' : 'Profit'} after discount, before operating costs
              </span>
              <strong>{money(Math.abs(quote.net - cost))}</strong>
            </div>
          ) : (
            <button className="text-button" onClick={() => store.openPanel('pricing')}>
              Calculate COGS to compare margins <Icon name="arrowRight" size={14} />
            </button>
          )}
          {knownHpp && quote.net < cost && (
            <p className="error-text">
              The discounted price is below COGS. Every cup sold makes a loss before operating
              costs.
            </p>
          )}
          {quote.discount > 0 && (
            <p className="hpp-feedback">
              Discounts are rounded to the nearest Rupiah per cup. The minimum payment is Rp1.
              Ingredient costs do not decrease with a discount.
            </p>
          )}
        </>
      ) : (
        <p className="error-text">
          Enter a whole percentage from 0 to {CONFIG.maxDiscountPercent}.
        </p>
      )}
    </article>
  );
}

export function PromotionPanel() {
  const session = useStore(gameStore, (s) => s.session)!;
  return (
    <>
      {session.day.phase !== 'preparation' && (
        <p className="notice">
          Discounts are locked during service. Change them during preparation for the next day.
        </p>
      )}
      {productIds.map((id) => (
        <PromotionEditor key={id} id={id} />
      ))}
    </>
  );
}
