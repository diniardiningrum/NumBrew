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
          <p>
            {item.active
              ? 'Menu diaktifkan'
              : 'Menu dinonaktifkan · diskon berlaku saat diaktifkan'}
          </p>
          <span className="tag green">
            {savedPercent ? `Diskon tersimpan: ${savedPercent}%` : 'Tanpa diskon'}
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
          Diskon {PRODUCTS[id].name} (%)
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
            Simpan diskon
          </button>
        </div>
        <p className="hpp-feedback">
          Atur 0% untuk menonaktifkan diskon. Maksimal {CONFIG.maxDiscountPercent}%.{' '}
          {valid && percent !== savedPercent
            ? 'Pratinjau ini belum disimpan.'
            : 'Pengaturan ini tetap berlaku sampai kamu mengubahnya saat persiapan.'}
        </p>
      </form>
      {quote ? (
        <>
          <div className="promo-math">
            <div>
              <span>Harga normal</span>
              <strong>{money(quote.gross)}</strong>
            </div>
            <div>
              <span>
                Diskon · {percent}% × {money(quote.gross)}
              </span>
              <strong>−{money(quote.discount)}</strong>
            </div>
            <div className="promo-net">
              <span>Pelanggan membayar</span>
              <strong>{money(quote.net)}</strong>
            </div>
          </div>
          {knownHpp ? (
            <div className={`contribution ${quote.net < cost ? 'loss' : ''}`}>
              <span>
                {quote.net < cost ? 'Rugi' : 'Laba'} setelah diskon, sebelum biaya operasional
              </span>
              <strong>{money(Math.abs(quote.net - cost))}</strong>
            </div>
          ) : (
            <button className="text-button" onClick={() => store.openPanel('pricing')}>
              Hitung HPP untuk membandingkan margin <Icon name="arrowRight" size={14} />
            </button>
          )}
          {knownHpp && quote.net < cost && (
            <p className="error-text">
              Harga setelah diskon di bawah HPP. Setiap gelas terjual merugi sebelum biaya
              operasional.
            </p>
          )}
          {quote.discount > 0 && (
            <p className="hpp-feedback">
              Diskon dibulatkan ke rupiah terdekat per gelas. Pembayaran minimal Rp1. Biaya bahan
              tidak berkurang karena diskon.
            </p>
          )}
        </>
      ) : (
        <p className="error-text">
          Masukkan persentase bulat dari 0 sampai {CONFIG.maxDiscountPercent}.
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
          Diskon terkunci selama pelayanan. Ubah saat persiapan hari berikutnya.
        </p>
      )}
      {productIds.map((id) => (
        <PromotionEditor key={id} id={id} />
      ))}
    </>
  );
}
