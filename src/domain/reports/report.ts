import type { Report, Session } from '../types';
import { inventoryValue } from '../inventory/inventory';
import { percentage } from '../economy/money';

export function buildReport(state: Session): Report {
  const d = state.day;
  const revenue = d.receipts.reduce((a, r) => a + r.price, 0);
  const discount = d.receipts.reduce((a, r) => a + r.discount, 0);
  const hpp = d.receipts.reduce((a, r) => a + r.hpp, 0);
  const tax = d.receipts.reduce((a, r) => a + r.tax, 0);
  const operating = d.phase === 'preparation' ? 0 : d.operatingCost;
  const profit = revenue - discount - hpp - operating - tax;
  return {
    day: d.number,
    revenue,
    discount,
    netRevenue: revenue - discount,
    hpp,
    operating,
    tax,
    profit,
    profitPct: percentage(profit, hpp + operating + tax),
    customers: d.receipts.length,
    visitors: d.visitors,
    missed: Object.values(d.missed).reduce((a, b) => a + b, 0),
    reputationChange: state.reputation - d.reputationStart,
    cashStart: d.cashStart,
    purchases: d.purchases,
    cashEnd: state.cash,
    inventoryValue: inventoryValue(state.inventory),
    receipts: structuredClone(d.receipts),
  };
}
