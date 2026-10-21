import { useState } from 'react';
import { useStore } from 'zustand';
import { gameStore } from '../store/gameStore';
import { Icon } from '../components/Icon';
import { money } from '../utils/format';
import { CONFIG } from '../data/catalog';

export function HelpPanel() {
  const items = [
    [
      'basket',
      'Beli sesuai kebutuhan',
      'Beli bahan dari pemasok. Kas berubah menjadi persediaan, bukan langsung menjadi kerugian.',
    ],
    [
      'calculator',
      'Kenali biaya tiap gelas',
      'Di Menu & harga, periksa biaya tiap bahan per porsi, termasuk kemasan. Jumlahkan, masukkan HPP, lalu pilih Periksa HPP sebelum menetapkan harga jual.',
    ],
    [
      'coffee',
      'Atur harga dan buka kafemu',
      'Harga rendah dapat menarik pelanggan. Harga tinggi memberi laba lebih besar per gelas, tetapi mungkin kurang terjangkau.',
    ],
    [
      'discount',
      'Pertimbangkan promosi',
      'Atur diskon tiap menu di Promosi & diskon saat persiapan. Harga rendah dapat menarik pembeli, tetapi HPP tetap sehingga margin berkurang. Diskon terkunci selama kafe buka.',
    ],
    [
      'users',
      'Layani pelanggan',
      'Dengarkan pesanan atau bantu pelanggan memilih minuman. Setelah disepakati, siapkan pesanan dan sajikan saat siap.',
    ],
    [
      'report',
      'Hitung hasil usahamu',
      `Setelah tutup, kurangi penjualan kotor dengan diskon. Lalu kurangi HPP dan biaya operasional sebesar ${money(CONFIG.operatingCost)} untuk menghitung laba atau rugi.`,
    ],
  ] as const;
  return (
    <>
      <div className="help-banner">
        <Icon name="sprout" size={32} />
        <h3>Kafe pertamamu dimulai di sini.</h3>
      </div>
      <div className="help-steps">
        {items.map(([icon, title, body], i) => (
          <div key={title}>
            <span className="step-number">0{i + 1}</span>
            <span>
              <h3>{title}</h3>
              <p>{body}</p>
            </span>
            <Icon name={icon} />
          </div>
        ))}
      </div>
    </>
  );
}

export function SettingsPanel() {
  const store = useStore(gameStore);
  const [confirm, setConfirm] = useState<'new' | 'retry' | null>(null);
  return (
    <>
      <div className="setting-row">
        <div>
          <strong>Kurangi animasi</strong>
          <p>Transisi lebih tenang dengan informasi yang tetap lengkap.</p>
        </div>
        <label className="switch">
          <input
            aria-label="Kurangi animasi"
            type="checkbox"
            checked={store.reducedMotion}
            onChange={(e) => store.setReducedMotion(e.target.checked)}
          />
          <span />
        </label>
      </div>
      <div className="setting-row">
        <div>
          <strong>Musik latar</strong>
          <p>Putar musik kafe berulang setelah kamu mulai bermain.</p>
        </div>
        <label className="switch">
          <input
            aria-label="Musik latar"
            type="checkbox"
            checked={store.musicEnabled}
            onChange={(e) => store.setMusicEnabled(e.target.checked)}
          />
          <span />
        </label>
      </div>
      <div className="setting-row">
        <div>
          <strong>Penyimpanan lokal</strong>
          <p>
            {store.saveStatus === 'saved'
              ? 'Progres tersimpan di peramban ini.'
              : store.warning || 'Penyimpanan belum tersedia.'}
          </p>
        </div>
        <button
          className="button secondary"
          disabled={!store.session}
          onClick={() => {
            gameStore.setState({ saveStatus: 'saved' });
            store.save();
          }}
        >
          Simpan ulang
        </button>
      </div>
      {store.saveStatus === 'failed' && (
        <button className="button secondary full" onClick={store.continueInMemory}>
          Lanjutkan sesi ini tanpa menyimpan
        </button>
      )}
      <div className="setting-row">
        <div>
          <strong>Ulangi hari ini</strong>
          <p>Kembali ke awal persiapan. Pembelian dan penjualan hari ini akan dibatalkan.</p>
        </div>
        <button
          className="button secondary"
          disabled={!store.session || store.readOnly}
          onClick={() => setConfirm('retry')}
        >
          <Icon name="reset" size={17} /> Ulangi
        </button>
      </div>
      <div className="setting-row">
        <div>
          <strong>Mulai kafe baru</strong>
          <p>Ganti progres saat ini dengan modal awal sebesar {money(500_000)}.</p>
        </div>
        <button
          className="button danger"
          disabled={store.readOnly}
          onClick={() => setConfirm('new')}
        >
          Mulai ulang
        </button>
      </div>
      {confirm && (
        <div className="confirm-box" role="alert">
          <h3>
            {confirm === 'new' ? 'Ganti progresmu dengan kafe baru?' : 'Kembali ke awal hari ini?'}
          </h3>
          <p>
            {confirm === 'new'
              ? 'Kas, stok, dan riwayat usahamu saat ini akan diganti.'
              : 'Semua progres sejak awal persiapan hari ini akan dibatalkan.'}
          </p>
          <div className="button-row">
            <button className="button secondary" onClick={() => setConfirm(null)}>
              Batal
            </button>
            <button
              className="button danger"
              onClick={() => {
                confirm === 'new' ? store.start(true) : store.retryDay();
                setConfirm(null);
              }}
            >
              {confirm === 'new' ? 'Ya, mulai kafe baru' : 'Ya, ulangi hari ini'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
