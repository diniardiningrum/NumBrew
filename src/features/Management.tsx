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
          <span>Pembelian menambah stok. Biaya bahan menjadi HPP saat minuman terjual.</span>
        </p>
        <div className="mini-balance">
          <span>Kas tersedia</span>
          <strong>{money(session.cash)}</strong>
        </div>
      </div>
      {!editable && (
        <div className="notice">Pemasok akan tersedia saat persiapan hari berikutnya.</div>
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
          <strong>Paket awal kafe</strong>
          <small>Semua bahan · 4 liter susu · 20 gelas</small>
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
                  {number(item.pack)} {item.unit} / kemasan
                </p>
                <small>
                  Stok: {number(stock(session.inventory, id))} {item.unit}
                </small>
              </div>
              <strong>{money(item.cost)}</strong>
              <div className="stepper">
                <button
                  aria-label={`Kurangi ${item.name}`}
                  disabled={!editable || !cart[id]}
                  onClick={() => setCart({ ...cart, [id]: Math.max(0, (cart[id] ?? 0) - 1) })}
                >
                  <Icon name="minus" size={15} />
                </button>
                <span aria-live="polite">{cart[id] ?? 0}</span>
                <button
                  aria-label={`Tambah ${item.name}`}
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
          <span>Total pembelian</span>
          <strong>{money(total)}</strong>
          <small>Kas setelah pembelian: {money(session.cash - total)}</small>
        </div>
        <button
          className="button primary"
          disabled={!editable || total === 0 || total > session.cash}
          onClick={() => {
            if (dispatch({ type: 'buy', cart })) setCart({});
          }}
        >
          <Icon name="bag" size={18} /> Beli bahan
        </button>
      </div>
      {total > session.cash && (
        <p className="error-text">Kas tidak cukup. Kurangi jumlah kemasan.</p>
      )}
      {total > 0 && session.cash >= total && session.cash - total < session.day.operatingCost && (
        <p className="error-text">
          Sisihkan {money(session.day.operatingCost)} untuk membuka kafe.
        </p>
      )}
    </>
  );
}

export function InventoryPanel() {
  const session = useStore(gameStore, (s) => s.session)!;
  return (
    <>
      <div className="panel-intro">
        <p>Sisa persediaan hari ini.</p>
        <div className="mini-balance">
          <span>Nilai persediaan</span>
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
              {stock(session.inventory, id) === 0 ? 'Stok habis' : 'Stok tersedia'}
            </span>
          </div>
        ))}
      </div>
      <h3 className="subheading">Minuman yang bisa dibuat dari stok saat ini</h3>
      {productIds.map((id) => (
        <div className="simple-row" key={id}>
          <span>{PRODUCTS[id].name}</span>
          <strong>{capacity(session.inventory, id)} porsi</strong>
        </div>
      ))}
      <div className="learning-note">
        <Icon name="book" />
        <p>
          Semua minuman menggunakan susu dan gelas yang sama. Angka di atas menunjukkan kapasitas
          tiap minuman secara terpisah dan tidak dapat dijumlahkan.
        </p>
      </div>
      <button
        className="button primary full"
        onClick={() => gameStore.getState().openPanel('supplier')}
      >
        <Icon name="plus" size={18} /> Tambah stok bahan
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
    else setFeedback('Perhitunganmu belum tersimpan. Periksa status penyimpanan dan coba lagi.');
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
            Tersedia di menu
          </label>
        </div>
      </div>
      <div className="cost-detail hpp-worksheet">
        <h4>
          <Icon name="calculator" size={17} /> 1. Periksa biaya tiap bahan
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
          HPP per porsi = biaya bahan + kemasan. Jumlahkan ketiga biaya di atas, lalu masukkan
          jawabanmu.
        </p>
        {cost.estimated && (
          <p className="muted">
            Perkiraan menggunakan harga pemasok karena bahan belum cukup untuk satu porsi.
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
          2. Hitung HPP per porsi
        </label>
        <div className="hpp-answer-row">
          <div className="money-input">
            <span>Rp</span>
            <input
              id={`hpp-${id}`}
              aria-label={`HPP per porsi ${PRODUCTS[id].name}`}
              aria-describedby={`hpp-feedback-${id}`}
              aria-invalid={!!feedback}
              inputMode="numeric"
              type="text"
              autoComplete="off"
              placeholder="Masukkan hasil penjumlahanmu"
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
            {verified ? 'HPP terverifikasi' : 'Periksa HPP'}
          </button>
        </div>
        <p
          id={`hpp-feedback-${id}`}
          className={feedback ? 'error-text' : 'hpp-feedback'}
          role="status"
        >
          {feedback ||
            (verified
              ? 'Benar! Gunakan HPP yang kamu hitung untuk menentukan harga jual.'
              : 'Hitung sendiri total HPP. Mencoba menjawab tidak mengurangi kas atau reputasi.')}
        </p>
      </form>
      <div className="price-fields manual-hpp-price">
        <label>
          <span className="field-label">3. Tentukan harga jual</span>
          <div className="money-input">
            <span>Rp</span>
            <input
              aria-label={`Harga ${PRODUCTS[id].name}`}
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
          Simpan harga
        </button>
      </div>
      {verified && (
        <div className={`contribution ${valid && netPrice < cost.hpp ? 'loss' : ''}`}>
          <span>
            {valid && netPrice < cost.hpp ? 'Rugi' : 'Laba'} per gelas sebelum biaya operasional
            {session.menu[id].discountPercent ? ' setelah diskon' : ''}
          </span>
          <strong>{valid ? money(Math.abs(netPrice - cost.hpp)) : '—'}</strong>
        </div>
      )}
      <p className="hpp-feedback">
        {verified
          ? 'Laba kotor = harga setelah diskon − HPP hasil perhitunganmu. Biaya operasional masuk dalam laporan harian.'
          : 'Periksa HPP terlebih dahulu untuk mengubah harga dan melihat laba atau rugi per gelas.'}
      </p>
      {!!session.menu[id].discountPercent && (
        <p className="hpp-feedback">
          Diskon tersimpan: {session.menu[id].discountPercent}%. Pelanggan membayar{' '}
          {valid ? money(netPrice) : '—'} dengan harga jual di atas.{' '}
          <button
            className="text-button"
            onClick={() => gameStore.getState().openPanel('promotion')}
          >
            Kelola diskon
          </button>
        </p>
      )}
      {verified && valid && netPrice < cost.hpp && (
        <p className="error-text">
          Kamu bisa memilih harga ini, tetapi setiap penjualan merugi bahkan sebelum biaya
          operasional.
        </p>
      )}
      {verified && !valid && (
        <p className="error-text">Masukkan harga dalam rupiah bulat dari Rp1 sampai Rp100.000.</p>
      )}
      {!editable && (
        <p className="notice">
          Kamu dapat memperbarui perhitungan HPP dan harga saat persiapan di tab utama permainan.
        </p>
      )}
    </article>
  );
}
export function PricingPanel() {
  return (
    <>
      <p className="muted panel-description">
        Jumlahkan biaya bahan untuk menghitung HPP (Harga Pokok Penjualan) per porsi, periksa
        jawabanmu, lalu tentukan harga jual. Harga terkunci selama kafe buka.
      </p>
      {productIds.map((id) => (
        <PriceEditor key={id} id={id} />
      ))}
    </>
  );
}
