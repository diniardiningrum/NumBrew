import {
  CONFIG,
  INGREDIENTS,
  PEOPLE,
  PRODUCTS,
  archetypes,
  ingredientIds,
  productIds,
  type IngredientId,
  type ProductId,
} from '../data/catalog';
import { integer } from '../domain/economy/money';
import { capacity, consume, emptyInventory, recipeCost } from '../domain/inventory/inventory';
import { hasCalculatedHpp, hppFeedback } from '../domain/pricing/hpp';
import { chooseProduct, purchaseChance, random } from '../domain/customer/customer';
import {
  BREW_SECONDS,
  brewingCapacity,
  createArrivalService,
  tasteReply,
  thankYou,
} from '../domain/customer/service';
import { buildReport } from '../domain/reports/report';
import { profitFeedback } from '../domain/reports/profitCalculation';
import { quotePrice } from '../domain/promotion/promotion';
import type { Day, GameResult, Session } from '../domain/types';

export type Command =
  | { type: 'buy'; cart: Partial<Record<IngredientId, number>> }
  | { type: 'price'; product: ProductId; price: number }
  | { type: 'promotion'; product: ProductId; percent: number }
  | { type: 'calculate_hpp'; product: ProductId; answer: number }
  | { type: 'calculate_profit'; day: number; answer: number }
  | { type: 'toggle'; product: ProductId }
  | { type: 'open' }
  | { type: 'tick' }
  | { type: 'ask'; id: string; topic: 'taste' | 'budget' }
  | { type: 'offer'; id: string; product: ProductId }
  | { type: 'change_order'; id: string }
  | { type: 'brew'; id: string }
  | { type: 'serve'; id: string }
  | { type: 'close' }
  | { type: 'finish' }
  | { type: 'next' }
  | { type: 'tutorial' };

export function newDay(number: number, cash: number, reputation: number): Day {
  return {
    number,
    phase: 'preparation',
    elapsed: 0,
    closeAt: 0,
    nextArrival: 3,
    customerSequence: 0,
    cashStart: cash,
    reputationStart: reputation,
    operatingCost: CONFIG.operatingCost,
    duration: CONFIG.daySeconds,
    taxRateBps: CONFIG.taxRateBps,
    purchases: 0,
    visitors: 0,
    missed: {
      over_budget: 0,
      no_available_menu: 0,
      low_interest: 0,
      queue_full: 0,
      wait_timeout: 0,
      closing: 0,
    },
    customers: [],
    receipts: [],
    settled: false,
  };
}
export function createSession(seed = 20261016, id = `cafe-${Date.now()}`): Session {
  return {
    id,
    revision: 0,
    dataVersion: CONFIG.dataVersion,
    rng: seed >>> 0 || 1,
    cash: CONFIG.initialCash,
    reputation: CONFIG.initialReputation,
    inventory: emptyInventory(),
    menu: {
      'matcha-latte': { active: true, price: 10_000 },
      'coffee-latte': { active: true, price: 10_000 },
      'cocoa-latte': { active: true, price: 9_000 },
    },
    day: newDay(1, CONFIG.initialCash, CONFIG.initialReputation),
    reports: [],
    ledger: [],
    tutorialSeen: false,
  };
}
function reputation(state: Session, delta: number): void {
  state.reputation = Math.min(
    100,
    state.day.reputationStart + 10,
    Math.max(0, state.day.reputationStart - 10, state.reputation + delta),
  );
}
function settle(state: Session): void {
  if (state.day.settled) throw new Error('Laporan hari ini sudah diselesaikan.');
  state.day.missed.closing += state.day.customers.length;
  state.day.customers = [];
  state.cash -= state.day.operatingCost;
  state.ledger.push({
    id: `settle-${state.day.number}`,
    day: state.day.number,
    kind: 'operating',
    amount: -state.day.operatingCost,
    description: 'Biaya operasional harian',
  });
  state.day.settled = true;
  state.day.phase = 'report';
  state.reports.push(buildReport(state));
  state.reports = state.reports.slice(-100);
  state.reports.slice(0, -7).forEach((r) => {
    r.receipts = [];
  });
}
function arrival(state: Session): void {
  const d = state.day;
  d.visitors++;
  d.customerSequence++;
  const available = archetypes.filter((id) => !d.customers.some((c) => c.archetype === id));
  const archetype = available[Math.floor(random(state) * available.length)];
  const profile = PEOPLE[archetype];
  const budget =
    profile.budget[0] +
    Math.floor(random(state) * ((profile.budget[1] - profile.budget[0]) / 1000 + 1)) * 1000;
  const product = chooseProduct(state, archetype, budget);
  if (!product) {
    const inStock = productIds.some(
      (id) => state.menu[id].active && capacity(state.inventory, id) > 0,
    );
    d.missed[inStock ? 'over_budget' : 'no_available_menu']++;
    return;
  }
  const quote = quotePrice(state.menu[product]);
  if (
    random(state) > purchaseChance(quote.net, state.reputation, archetype, quote.discountPercent)
  ) {
    d.missed.low_interest++;
    return;
  }
  if (d.customers.length >= CONFIG.maxQueue) {
    d.missed.queue_full++;
    return;
  }
  const id = `${state.id}-d${d.number}-c${d.customerSequence}`;
  d.customers.push({
    id,
    archetype,
    name: profile.names[Math.floor(random(state) * profile.names.length)],
    product,
    budget,
    price: quote.net,
    discount: quote.discount,
    discountPercent: quote.discountPercent,
    arrivedAt: d.elapsed,
    patience: profile.patience,
    service: createArrivalService({ id, archetype, product }, random(state)),
  });
  const customer = d.customers[d.customers.length - 1];
  if (quote.discount > 0 && customer.service.stage === 'ordered')
    customer.service.line += ` Dengan diskon ${quote.discountPercent}%, harganya menjadi Rp${quote.net.toLocaleString('id-ID')}, ya.`;
}

export function dispatchCommand(previous: Session, command: Command): GameResult {
  // Work on a draft; failed validation never exposes a partial stock/cash update.
  const state = structuredClone(previous);
  const d = state.day;
  try {
    let message = '';
    if (
      ['buy', 'price', 'promotion', 'calculate_hpp', 'toggle', 'open'].includes(command.type) &&
      d.phase !== 'preparation'
    )
      throw new Error('Pengaturan hanya tersedia saat persiapan.');
    switch (command.type) {
      case 'buy': {
        if (Object.keys(command.cart).some((id) => !ingredientIds.includes(id as IngredientId)))
          throw new Error('Bahan tidak dikenal.');
        const items = ingredientIds.map((id) => ({
          id,
          packs: integer(command.cart[id] ?? 0, 'Jumlah kemasan', 100),
        }));
        const total = items.reduce((n, { id, packs }) => n + packs * INGREDIENTS[id].cost, 0);
        if (total <= 0) throw new Error('Pilih setidaknya satu kemasan bahan.');
        if (total > state.cash) throw new Error('Kas tidak cukup untuk pembelian ini.');
        for (const { id, packs } of items.filter((i) => i.packs)) {
          const def = INGREDIENTS[id];
          state.inventory[id].push({
            id: `batch-${d.number}-${state.revision}-${id}`,
            quantity: def.pack * packs,
            consumed: 0,
            cost: def.cost * packs,
          });
        }
        state.cash -= total;
        d.purchases += total;
        state.ledger.push({
          id: `purchase-${state.revision}`,
          day: d.number,
          kind: 'purchase',
          amount: -total,
          description: 'Pembelian bahan dari pemasok',
        });
        message = 'Bahanmu sudah tiba. Saatnya menyusun menu!';
        break;
      }
      case 'calculate_hpp': {
        if (!PRODUCTS[command.product]) throw new Error('Menu tidak dikenal.');
        const expected = recipeCost(state.inventory, command.product).hpp;
        const feedback = hppFeedback(command.answer, expected);
        if (feedback) throw new Error(feedback);
        state.menu[command.product].calculatedHpp = command.answer;
        message = 'Perhitungan HPP-mu benar. Sekarang tentukan harga jualnya.';
        break;
      }
      case 'calculate_profit': {
        integer(command.day, 'Hari laporan');
        const report = state.reports.find((r) => r.day === command.day);
        if (!report) throw new Error('Hasil akhir hanya dapat disimpan setelah hari berakhir.');
        const feedback = profitFeedback(command.answer, report.profit);
        if (feedback) throw new Error(feedback);
        report.calculatedProfit = command.answer;
        message =
          'Perhitungan laba / rugi bersihmu benar. Hasilnya tersimpan dalam laporan harian.';
        break;
      }
      case 'promotion':
        if (!PRODUCTS[command.product]) throw new Error('Menu tidak dikenal.');
        integer(command.percent, 'Diskon', CONFIG.maxDiscountPercent);
        state.menu[command.product].discountPercent = command.percent;
        message = command.percent
          ? `Diskon ${command.percent}% untuk ${PRODUCTS[command.product].name} disimpan.`
          : `Promosi ${PRODUCTS[command.product].name} dinonaktifkan.`;
        break;
      case 'price':
        if (!PRODUCTS[command.product]) throw new Error('Menu tidak dikenal.');
        integer(command.price, 'Harga', CONFIG.maxPrice);
        if (command.price < 1) throw new Error('Harga harus lebih dari Rp0.');
        if (!hasCalculatedHpp(state, command.product))
          throw new Error('Hitung dan periksa HPP per porsi sebelum menyimpan harga jual.');
        state.menu[command.product].price = command.price;
        message = 'Harga menu disimpan.';
        break;
      case 'toggle':
        if (!PRODUCTS[command.product]) throw new Error('Menu tidak dikenal.');
        state.menu[command.product].active = !state.menu[command.product].active;
        break;
      case 'open':
        if (!productIds.some((id) => state.menu[id].active && capacity(state.inventory, id) > 0))
          throw new Error('Siapkan bahan untuk setidaknya satu menu aktif.');
        if (state.cash < d.operatingCost)
          throw new Error('Sisihkan Rp20.000 untuk biaya operasional.');
        d.phase = 'open';
        state.tutorialSeen = true;
        message = 'Kafe buka. Pelanggan pertamamu akan segera datang!';
        break;
      case 'tick':
        if (d.phase !== 'open' && d.phase !== 'closing') return { state: previous, message: '' };
        d.elapsed++;
        d.customers = d.customers.filter((c) => {
          if (d.elapsed - c.arrivedAt >= c.patience) {
            d.missed.wait_timeout++;
            reputation(state, c.archetype === 'blogger' ? -3 : -1);
            return false;
          }
          return true;
        });
        if (d.phase === 'open' && d.elapsed >= d.duration) {
          d.phase = 'closing';
          d.closeAt = d.elapsed + CONFIG.closingSeconds;
          message = 'Jam buka telah berakhir. Layani antrean yang tersisa.';
        }
        if (d.phase === 'open' && d.elapsed >= d.nextArrival) {
          arrival(state);
          d.nextArrival =
            d.elapsed +
            CONFIG.arrivalMinSeconds +
            Math.floor(random(state) * (CONFIG.arrivalMaxSeconds - CONFIG.arrivalMinSeconds + 1));
        }
        for (const customer of d.customers) {
          if (customer.service.stage === 'preparing' && d.elapsed >= customer.service.readyAt!) {
            customer.service.stage = 'ready';
            customer.service.line = [
              'Wah, sudah siap! Boleh saya bayar sekarang?',
              'Aromanya enak. Saya siap menikmati minumannya!',
              'Minumannya sudah jadi, ya. Terima kasih sudah membuatkannya!',
            ][customer.service.variant];
          }
        }
        if (d.phase === 'closing' && (d.customers.length === 0 || d.elapsed >= d.closeAt)) {
          settle(state);
          message = 'Hari selesai. Temukan cerita di balik angka-angkanya.';
        }
        break;
      case 'ask': {
        if (d.phase !== 'open' && d.phase !== 'closing') throw new Error('Kafe belum buka.');
        const customer = d.customers.find((c) => c.id === command.id);
        if (!customer || customer.service.stage !== 'greeting')
          throw new Error('Pelanggan ini sudah memilih pesanan.');
        if (command.topic !== 'taste' && command.topic !== 'budget')
          throw new Error('Pertanyaan tidak dikenal.');
        const flag = command.topic === 'taste' ? 'askedTaste' : 'askedBudget';
        if (customer.service[flag]) throw new Error('Pertanyaan ini sudah dijawab.');
        customer.service[flag] = true;
        customer.service.line =
          command.topic === 'taste'
            ? tasteReply(customer)
            : `Anggaran saya sampai Rp${customer.budget.toLocaleString('id-ID')}. Tolong pilihkan yang sesuai, ya.`;
        break;
      }
      case 'offer': {
        if (d.phase !== 'open' && d.phase !== 'closing') throw new Error('Kafe belum buka.');
        const customer = d.customers.find((c) => c.id === command.id);
        if (!customer || customer.service.stage !== 'greeting')
          throw new Error('Pesanan sudah disepakati.');
        if (!PRODUCTS[command.product] || !state.menu[command.product].active)
          throw new Error('Menu ini tidak tersedia hari ini.');
        if (brewingCapacity(state, command.product) < 1)
          throw new Error('Bahan minuman ini habis atau sudah disisihkan untuk pesanan lain.');
        const quote = quotePrice(state.menu[command.product]);
        const price = quote.net;
        if (price > customer.budget) {
          customer.service.refusals++;
          customer.patience = Math.max(1, customer.patience - 4);
          customer.service.line = `Rp${price.toLocaleString('id-ID')} melebihi anggaran saya. Batasnya Rp${customer.budget.toLocaleString('id-ID')}. Ada pilihan lain?`;
          customer.service.askedBudget = true;
          if (customer.service.refusals >= 3) {
            d.customers = d.customers.filter((c) => c.id !== customer.id);
            d.missed.low_interest++;
            reputation(state, -1);
            message = `${customer.name} pergi setelah tiga penawaran melebihi anggarannya. Reputasi menurun.`;
          }
          break;
        }
        customer.product = command.product;
        customer.price = price;
        customer.discount = quote.discount;
        customer.discountPercent = quote.discountPercent;
        customer.service.stage = 'ordered';
        customer.service.line =
          command.product === PEOPLE[customer.archetype].favorite
            ? `${PRODUCTS[command.product].name} favorit saya! Rp${price.toLocaleString('id-ID')} cocok untuk saya. Satu gelas, ya.`
            : `Baik, saya coba ${PRODUCTS[command.product].name}. Rp${price.toLocaleString('id-ID')} masih sesuai anggaran saya.`;
        break;
      }
      case 'change_order': {
        const customer = d.customers.find((c) => c.id === command.id);
        if (
          !customer ||
          customer.service.stage !== 'ordered' ||
          !['open', 'closing'].includes(d.phase)
        )
          throw new Error('Pesanan tidak dapat diubah saat sedang disiapkan.');
        customer.service.stage = 'greeting';
        customer.service.line = 'Baik, kita pilih lagi sebelum dibuat. Ada rekomendasi lain?';
        break;
      }
      case 'brew': {
        if (d.phase !== 'open' && d.phase !== 'closing') throw new Error('Kafe belum buka.');
        const customer = d.customers.find((c) => c.id === command.id);
        if (!customer || customer.service.stage !== 'ordered')
          throw new Error('Sepakati minumannya sebelum menyiapkannya.');
        if (brewingCapacity(state, customer.product, customer.id) < 1)
          throw new Error(
            'Bahan sudah disisihkan untuk pesanan lain. Tawarkan minuman lain sebelum menyiapkannya.',
          );
        customer.service.stage = 'preparing';
        customer.service.style = 'standard';
        customer.service.startedAt = d.elapsed;
        customer.service.readyAt = d.elapsed + BREW_SECONDS.standard;
        customer.service.line = [
          'Baik, saya tunggu minumannya. Terima kasih!',
          'Bagus, sudah mulai dibuat. Saya tunggu di sini.',
          'Wah, aromanya sudah tercium. Tidak sabar mencobanya.',
        ][customer.service.variant];
        break;
      }
      case 'serve': {
        if (d.phase !== 'open' && d.phase !== 'closing') throw new Error('Kafe belum buka.');
        const customer = d.customers.find((c) => c.id === command.id);
        if (!customer) throw new Error('Pesanan ini sudah selesai atau pelanggannya sudah pergi.');
        if (customer.service.stage !== 'ready')
          throw new Error(
            'Minuman belum siap disajikan. Sepakati pesanan dan siapkan terlebih dahulu.',
          );
        if (capacity(state.inventory, customer.product) < 1)
          throw new Error('Bahan untuk pesanan ini sudah habis.');
        const lines = Object.entries(PRODUCTS[customer.product].recipe).map(([key, quantity]) => {
          const ingredient = key as IngredientId;
          return { ingredient, quantity, cost: consume(state.inventory, ingredient, quantity) };
        });
        const receipt = {
          id: `sale-${customer.id}`,
          customerId: customer.id,
          customer: customer.name,
          product: customer.product,
          day: d.number,
          price: customer.price + (customer.discount ?? 0),
          discount: customer.discount ?? 0,
          discountPercent: customer.discountPercent ?? 0,
          tax: 0,
          hpp: lines.reduce((n, l) => n + l.cost, 0),
          lines,
          time: d.elapsed,
        };
        const paid = receipt.price - receipt.discount;
        integer(state.cash + paid, 'Kas', CONFIG.maxCash);
        state.cash += paid;
        d.receipts.push(receipt);
        state.ledger.push({
          id: receipt.id,
          day: d.number,
          kind: 'sale',
          amount: paid,
          description: PRODUCTS[receipt.product].name,
        });
        d.customers = d.customers.filter((c) => c.id !== customer.id);
        const priorReputation = state.reputation;
        const tailored =
          customer.service.askedTaste && customer.product === PEOPLE[customer.archetype].favorite;
        reputation(
          state,
          (customer.archetype === 'blogger' ? 3 : 1) +
            (customer.service.style === 'careful' ? 1 : 0) +
            (tailored ? 1 : 0),
        );
        state.revision++;
        return {
          state,
          message: `${PRODUCTS[receipt.product].name} untuk ${customer.name}. Terima kasih!`,
          receipt,
          reaction: {
            customerId: customer.id,
            name: customer.name,
            archetype: customer.archetype,
            line: thankYou(customer),
            contribution: paid - receipt.hpp,
            reputationDelta: state.reputation - priorReputation,
          },
        };
      }
      case 'close':
        if (d.phase !== 'open') throw new Error('Kafe sedang tidak buka.');
        d.phase = 'closing';
        d.closeAt = d.elapsed + CONFIG.closingSeconds;
        if (!d.customers.length) settle(state);
        message = d.settled
          ? 'Hari selesai. Laporanmu sudah siap.'
          : 'Tidak ada pelanggan baru. Layani antrean yang tersisa.';
        break;
      case 'finish':
        if (d.phase !== 'closing') throw new Error('Akhiri jam buka terlebih dahulu.');
        settle(state);
        message = 'Kafe tutup. Laporanmu sudah siap.';
        break;
      case 'next':
        if (d.phase !== 'report' || !d.settled)
          throw new Error('Selesaikan laporan hari ini terlebih dahulu.');
        state.day = newDay(d.number + 1, state.cash, state.reputation);
        ingredientIds.forEach((id) => {
          state.inventory[id] = state.inventory[id].filter((b) => b.consumed < b.quantity);
        });
        state.ledger = state.ledger.filter((l) => l.day > d.number - 7);
        message = 'Hari baru, peluang baru. Apa rencanamu hari ini?';
        break;
      case 'tutorial':
        state.tutorialSeen = true;
        break;
    }
    state.revision++;
    return { state, message };
  } catch (error) {
    return {
      state: previous,
      message: error instanceof Error ? error.message : 'Tindakan ini tidak dapat diproses.',
      error: true,
    };
  }
}
