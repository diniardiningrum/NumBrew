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
      <span className="eyebrow">FROM DECISIONS TO CALCULATIONS</span>
      <h3>Where did your cafe money go?</h3>
      <div className="formula">
        <span>Gross sales</span>
        <b>{money(report.revenue)}</b>
        <span>− Discount</span>
        <b>{money(report.discount)}</b>
        <span>Net revenue</span>
        <b>{money(report.netRevenue)}</b>
        <span>− Cost of goods sold</span>
        <b>{money(report.hpp)}</b>
        <span>− Operating costs</span>
        <b>{money(report.operating)}</b>
        <span>− Simulated tax</span>
        <b>{money(report.tax)}</b>
        <span className="total">= Net profit / loss</span>
        <b className="total">{verified ? money(report.profit) : 'Calculate your result'}</b>
      </div>
      <p>
        Profit percentage = net profit ÷ (COGS + operating costs + tax) × 100% ={' '}
        <strong>
          {verified ? percent(report.profitPct) : 'shown after your answer is checked'}
        </strong>
        . The denominator is costs, not revenue.
      </p>
      <div className="learning-note">
        <Icon name="book" />
        <p>
          Not all ingredient purchases become expenses. Unsold ingredients remain inventory worth{' '}
          <strong>{money(report.inventoryValue)}</strong>.
        </p>
      </div>
      <h4>Cash reconciliation</h4>
      <p>
        {money(report.cashStart)} − {money(report.purchases)} + {money(report.netRevenue)} −{' '}
        {money(report.operating)} − {money(report.tax)} = <strong>{money(report.cashEnd)}</strong>
      </p>
      <small>
        Opening cash − purchases + net sales − operating costs − tax. Operating costs have not yet
        been paid in a live report; closing cash is projected until the day ends.
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
      setFeedback('Your result has not been saved. Check the save status and try again.');
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
    ['Gross sales', report.revenue],
    ['Discount', -report.discount],
    ['Net revenue', report.netRevenue],
    ['Cost of goods sold', -report.hpp],
    ['Operating costs', -report.operating],
    ['Tax · not yet enabled', -report.tax],
  ] as const;
  return (
    <>
      <div className="report-selector">
        <span className="tag green">{finalized ? 'Day complete' : 'Live report'}</span>
        <label>
          Day{' '}
          <select
            aria-label="Select report day"
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
        {verified && report.profit === 0 && <span>Every story starts at zero</span>}
        <h2>{verified ? money(report.profit) : 'How did your cafe do?'}</h2>
        <p>
          {verified
            ? `${report.profit < 0 ? 'Net loss' : report.profit === 0 ? 'Break-even' : 'Net profit'} · ${percent(report.profitPct)} of total costs`
            : 'Use the breakdown below to calculate your net profit or loss.'}
        </p>
      </div>
      <div className="report-metrics">
        <div>
          <Icon name="users" />
          <strong>{report.customers}</strong>
          <span>Customers served</span>
        </div>
        <div>
          <Icon name="star" />
          <strong>
            {report.reputationChange > 0 ? '+' : ''}
            {report.reputationChange}
          </strong>
          <span>Reputation change</span>
        </div>
        <div>
          <Icon name="store" />
          <strong>{report.visitors}</strong>
          <span>Total visitors</span>
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
          <span>Net profit / loss</span>
          <strong>{verified ? money(report.profit) : 'Enter your calculated result'}</strong>
        </div>
      </div>
      <section className="profit-worksheet" aria-label="Profit and loss calculation guide">
        <h3>
          <Icon name="calculator" size={18} /> How to calculate
        </h3>
        <ol>
          <li>Net revenue = gross sales − discounts.</li>
          <li>Total costs = cost of goods sold + operating costs + tax.</li>
          <li>Net profit / loss = net revenue − total costs.</li>
        </ol>
        <p className="profit-equation">
          {money(report.netRevenue)} − ({money(report.hpp)} + {money(report.operating)} +{' '}
          {money(report.tax)}) = <strong>{verified ? money(report.profit) : '?'}</strong>
        </p>
        <p>
          A positive result means profit, a negative result means loss, and 0 means break-even. Use
          the cost of ingredients sold, not all stock purchases.
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
          Calculate net profit / loss · Day {day}
        </label>
        <div className="hpp-answer-row">
          <div className="money-input">
            <span>Rp</span>
            <input
              id="profit-answer"
              aria-label="Net profit or loss answer"
              aria-describedby="profit-feedback"
              aria-invalid={!!feedback}
              type="text"
              inputMode="text"
              autoComplete="off"
              placeholder="Enter your result, negative for a loss"
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
            {verified ? 'Result verified' : 'Check answer'}
          </button>
        </div>
        <p id="profit-feedback" role="status" className={feedback ? 'error-text' : 'hpp-feedback'}>
          {feedback ||
            (verified
              ? finalized
                ? 'Correct! Your calculation has been saved for this day.'
                : 'Correct for this live report. Calculate again after closing, as the figures may still change.'
              : 'Add the costs, then subtract them from net revenue. You enter the final answer.')}
        </p>
        {!finalized && (
          <p className="hpp-feedback">
            This report is still a forecast. Final results are saved after the cafe closes.
          </p>
        )}
      </form>
      <button
        className="button secondary full profit-detail-toggle"
        onClick={() => setDetail(!detail)}
        aria-expanded={detail}
      >
        <Icon name="calculator" /> {detail ? 'Hide calculation' : 'View Calculation'}
      </button>
      {detail && <Breakdown report={adjusted} verified={verified} />}
      <div className="report-advice">
        <Icon name="sprout" />
        <div>
          <strong>Notes for the next day</strong>
          <p>
            {!verified
              ? 'Calculate your net result, then compare revenue and costs to plan for the next day.'
              : report.profit < 0
                ? 'Profit per cup may not cover daily costs. Review prices, sales volume, and ingredients that run out fastest.'
                : report.customers === 0
                  ? 'Start with enough ingredients, set prices, then observe your customers.'
                  : 'Keep popular drinks on the menu and check milk and cup stock before opening again.'}
          </p>
        </div>
      </div>
      <details className="receipt-list">
        <summary>Transaction history · {report.customers} sales</summary>
        {report.receipts.length ? (
          report.receipts.map((r) => (
            <div className="simple-row" key={r.id}>
              <span>
                {r.customer}
                <small>
                  {PRODUCTS[r.product].name} · COGS {money(r.hpp)}
                </small>
                {r.discount > 0 && (
                  <small>
                    Regular price {money(r.price)} − discount {r.discountPercent}% (
                    {money(r.discount)}) = {money(r.price - r.discount)}
                  </small>
                )}
              </span>
              <strong>{money(r.price - r.discount)}</strong>
            </div>
          ))
        ) : (
          <p className="muted">
            {report.customers
              ? 'The details for this day have been archived. The summary is still available.'
              : 'No transactions yet for this day.'}
          </p>
        )}
      </details>
      {session.day.phase === 'report' && day === session.day.number && (
        <button
          className="button primary full next-day"
          onClick={() => gameStore.getState().dispatch({ type: 'next' })}
        >
          Prepare for day {session.day.number + 1}
          <Icon name="arrowRight" size={18} />
        </button>
      )}
    </>
  );
}
