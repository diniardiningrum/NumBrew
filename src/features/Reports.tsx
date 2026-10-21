import { useState } from 'react';
import { useStore } from 'zustand';
import { PRODUCTS } from '../data/catalog';
import { buildReport } from '../domain/reports/report';
import {
  hasCalculatedProfit,
  parseProfitInput,
  profitBasis,
  profitFeedback,
} from '../domain/reports/profitCalculation';
import { gameStore } from '../store/gameStore';
import { Icon } from '../components/Icon';
import { money, percent } from '../utils/format';
import type { Report } from '../domain/types';

function Breakdown({ report, verified }: { report: Report; verified: boolean }) {
  return (
    <div className="report-calculation">
      <span className="eyebrow">DARI KEPUTUSAN KE PERHITUNGAN</span>
      <h3>Ke mana uang kafemu mengalir?</h3>
      <div className="formula">
        <span>Penjualan kotor</span>
        <b>{money(report.revenue)}</b>
        <span>− Diskon</span>
        <b>{money(report.discount)}</b>
        <span>Pendapatan bersih</span>
        <b>{money(report.netRevenue)}</b>
        <span>− Harga pokok penjualan</span>
        <b>{money(report.hpp)}</b>
        <span>− Biaya operasional</span>
        <b>{money(report.operating)}</b>
        <span>− Simulasi pajak</span>
        <b>{money(report.tax)}</b>
        <span className="total">= Laba / rugi bersih</span>
        <b className="total">{verified ? money(report.profit) : 'Hitung hasil usahamu'}</b>
      </div>
      <p>
        Persentase laba = laba bersih ÷ (HPP + biaya operasional + pajak) × 100% ={' '}
        <strong>{verified ? percent(report.profitPct) : 'muncul setelah jawaban diperiksa'}</strong>
        . Penyebutnya adalah biaya, bukan pendapatan.
      </p>
      <div className="learning-note">
        <Icon name="book" />
        <p>
          Tidak semua pembelian bahan menjadi beban. Bahan yang belum terjual tetap menjadi
          persediaan senilai <strong>{money(report.inventoryValue)}</strong>.
        </p>
      </div>
      <h4>Rekonsiliasi kas</h4>
      <p>
        {money(report.cashStart)} − {money(report.purchases)} + {money(report.netRevenue)} −{' '}
        {money(report.operating)} − {money(report.tax)} = <strong>{money(report.cashEnd)}</strong>
      </p>
      <small>
        Kas awal − pembelian + penjualan bersih − biaya operasional − pajak. Biaya operasional belum
        dibayar dalam laporan sementara; kas akhir masih berupa perkiraan hingga hari berakhir.
      </small>
    </div>
  );
}

export function ReportPanel() {
  const session = useStore(gameStore, (s) => s.session)!;
  const [day, setDay] = useState(session.day.number);
  const finalized = session.reports.find((r) => r.day === day);
  const report = finalized ?? buildReport(session);
  return <ReportForDay key={`${profitBasis(report)}:${!!finalized}`} day={day} setDay={setDay} />;
}

function ReportForDay({ day, setDay }: { day: number; setDay: (day: number) => void }) {
  const session = useStore(gameStore, (s) => s.session)!;
  const store = useStore(gameStore);
  const [detail, setDetail] = useState(false);
  const finalized = session.reports.find((r) => r.day === day);
  const report = finalized ?? buildReport(session);
  const [answer, setAnswer] = useState(() =>
    hasCalculatedProfit(report) ? String(report.calculatedProfit) : '',
  );
  const [checked, setChecked] = useState(false);
  const [feedback, setFeedback] = useState('');
  const parsed = parseProfitInput(answer);
  const verified = (hasCalculatedProfit(report) || checked) && parsed === report.profit;
  const blocked = store.readOnly || store.saveStatus === 'failed';
  const checkProfit = () => {
    const problem = profitFeedback(parsed, report.profit);
    if (problem) {
      setFeedback(problem);
      return;
    }
    if (finalized && !store.dispatch({ type: 'calculate_profit', day, answer: parsed! })) {
      setFeedback('Hasilmu belum tersimpan. Periksa status penyimpanan dan coba lagi.');
      return;
    }
    setFeedback('');
    setChecked(true);
  };
  // Before settlement the displayed forecast includes the still-reserved operating payment.
  const adjusted = finalized
    ? report
    : { ...report, cashEnd: report.cashEnd - report.operating - report.tax };
  const rows = [
    ['Penjualan kotor', report.revenue],
    ['Diskon', -report.discount],
    ['Pendapatan bersih', report.netRevenue],
    ['Harga pokok penjualan', -report.hpp],
    ['Biaya operasional', -report.operating],
    ['Pajak · belum diaktifkan', -report.tax],
  ] as const;
  return (
    <>
      <div className="report-selector">
        <span className="tag green">{finalized ? 'Hari selesai' : 'Laporan sementara'}</span>
        <label>
          Hari{' '}
          <select
            aria-label="Pilih hari laporan"
            value={day}
            onChange={(e) => setDay(Number(e.target.value))}
          >
            {[...new Set([...session.reports.map((r) => r.day), session.day.number])]
              .reverse()
              .map((n) => (
                <option value={n} key={n}>
                  {n}
                </option>
              ))}
          </select>
        </label>
      </div>
      <div className={`profit-hero ${verified && report.profit < 0 ? 'loss' : ''}`}>
        {verified && report.profit === 0 && <span>Setiap cerita dimulai dari nol</span>}
        <h2>{verified ? money(report.profit) : 'Bagaimana hasil usaha kafemu?'}</h2>
        <p>
          {verified
            ? `${report.profit < 0 ? 'Rugi bersih' : report.profit === 0 ? 'Impas' : 'Laba bersih'} · ${percent(report.profitPct)} dari total biaya`
            : 'Gunakan rincian di bawah untuk menghitung laba atau rugi bersihmu.'}
        </p>
      </div>
      <div className="report-metrics">
        <div>
          <Icon name="users" />
          <strong>{report.customers}</strong>
          <span>Pelanggan dilayani</span>
        </div>
        <div>
          <Icon name="star" />
          <strong>
            {report.reputationChange > 0 ? '+' : ''}
            {report.reputationChange}
          </strong>
          <span>Perubahan reputasi</span>
        </div>
        <div>
          <Icon name="store" />
          <strong>{report.visitors}</strong>
          <span>Total pengunjung</span>
        </div>
      </div>
      <div className="report-lines">
        {rows.map(([label, value]) => (
          <div className="simple-row" key={label}>
            <span>{label}</span>
            <strong>{money(value)}</strong>
          </div>
        ))}
        <div className="simple-row total">
          <span>Laba / rugi bersih</span>
          <strong>{verified ? money(report.profit) : 'Masukkan hasil perhitunganmu'}</strong>
        </div>
      </div>
      <section className="profit-worksheet" aria-label="Panduan menghitung laba dan rugi">
        <h3>
          <Icon name="calculator" size={18} /> Cara menghitung
        </h3>
        <ol>
          <li>Pendapatan bersih = penjualan kotor − diskon.</li>
          <li>Total biaya = harga pokok penjualan + biaya operasional + pajak.</li>
          <li>Laba / rugi bersih = pendapatan bersih − total biaya.</li>
        </ol>
        <p className="profit-equation">
          {money(report.netRevenue)} − ({money(report.hpp)} + {money(report.operating)} +{' '}
          {money(report.tax)}) = <strong>{verified ? money(report.profit) : '?'}</strong>
        </p>
        <p>
          Hasil positif berarti laba, negatif berarti rugi, dan 0 berarti impas. Gunakan biaya bahan
          yang terjual, bukan seluruh pembelian stok.
        </p>
      </section>
      <form
        className={`hpp-calculation ${verified ? 'verified' : ''}`}
        onSubmit={(event) => {
          event.preventDefault();
          if (!blocked) checkProfit();
        }}
      >
        <label htmlFor="profit-answer" className="field-label">
          Hitung laba / rugi bersih · Hari {day}
        </label>
        <div className="hpp-answer-row">
          <div className="money-input">
            <span>Rp</span>
            <input
              id="profit-answer"
              aria-label="Jawaban laba atau rugi bersih"
              aria-describedby="profit-feedback"
              aria-invalid={!!feedback}
              type="text"
              inputMode="text"
              autoComplete="off"
              placeholder="Masukkan hasil, negatif jika rugi"
              value={answer}
              disabled={blocked}
              onChange={(e) => {
                setAnswer(e.target.value);
                setFeedback('');
                setChecked(false);
              }}
            />
          </div>
          <button
            type="submit"
            className="button secondary"
            disabled={blocked || !answer.trim() || verified}
          >
            <Icon name={verified ? 'check' : 'calculator'} size={16} />{' '}
            {verified ? 'Hasil terverifikasi' : 'Periksa jawaban'}
          </button>
        </div>
        <p id="profit-feedback" role="status" className={feedback ? 'error-text' : 'hpp-feedback'}>
          {feedback ||
            (verified
              ? finalized
                ? 'Benar! Perhitunganmu sudah disimpan untuk hari ini.'
                : 'Benar untuk laporan sementara ini. Hitung lagi setelah tutup karena angkanya masih dapat berubah.'
              : 'Jumlahkan biaya, lalu kurangi pendapatan bersih dengan total biaya. Masukkan hasil akhirnya.')}
        </p>
        {!finalized && (
          <p className="hpp-feedback">
            Laporan ini masih berupa perkiraan. Hasil akhir disimpan setelah kafe tutup.
          </p>
        )}
      </form>
      <button
        className="button secondary full profit-detail-toggle"
        onClick={() => setDetail(!detail)}
        aria-expanded={detail}
      >
        <Icon name="calculator" /> {detail ? 'Sembunyikan perhitungan' : 'Lihat perhitungan'}
      </button>
      {detail && <Breakdown report={adjusted} verified={verified} />}
      <div className="report-advice">
        <Icon name="sprout" />
        <div>
          <strong>Catatan untuk hari berikutnya</strong>
          <p>
            {!verified
              ? 'Hitung hasil bersihmu, lalu bandingkan pendapatan dan biaya untuk merencanakan hari berikutnya.'
              : report.profit < 0
                ? 'Laba per gelas mungkin belum menutup biaya harian. Periksa harga, jumlah penjualan, dan bahan yang paling cepat habis.'
                : report.customers === 0
                  ? 'Siapkan bahan yang cukup, tentukan harga, lalu amati pelangganmu.'
                  : 'Pertahankan minuman favorit di menu dan periksa stok susu serta gelas sebelum buka lagi.'}
          </p>
        </div>
      </div>
      <details className="receipt-list">
        <summary>Riwayat transaksi · {report.customers} penjualan</summary>
        {report.receipts.length ? (
          report.receipts.map((r) => (
            <div className="simple-row" key={r.id}>
              <span>
                {r.customer}
                <small>
                  {PRODUCTS[r.product].name} · HPP {money(r.hpp)}
                </small>
                {r.discount > 0 && (
                  <small>
                    Harga normal {money(r.price)} − diskon {r.discountPercent}% ({money(r.discount)}
                    ) = {money(r.price - r.discount)}
                  </small>
                )}
              </span>
              <strong>{money(r.price - r.discount)}</strong>
            </div>
          ))
        ) : (
          <p className="muted">
            {report.customers
              ? 'Rincian hari ini sudah diarsipkan. Ringkasannya tetap tersedia.'
              : 'Belum ada transaksi pada hari ini.'}
          </p>
        )}
      </details>
      {session.day.phase === 'report' && day === session.day.number && (
        <button
          className="button primary full next-day"
          onClick={() => gameStore.getState().dispatch({ type: 'next' })}
        >
          Persiapan hari ke- {session.day.number + 1}
          <Icon name="arrowRight" size={18} />
        </button>
      )}
    </>
  );
}
