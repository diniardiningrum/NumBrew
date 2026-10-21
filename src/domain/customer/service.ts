import { CONFIG, PEOPLE, PRODUCTS, type Archetype, type ProductId } from '../../data/catalog';
import type { BrewStyle, Customer, CustomerService, Session } from '../types';
import { capacity, consume } from '../inventory/inventory';

export const BREW_SECONDS: Record<BrewStyle, number> = {
  standard: CONFIG.preparationSeconds,
  careful: 6,
  quick: 2,
};

export function createArrivalService(
  customer: Pick<Customer, 'id' | 'archetype' | 'product'>,
  draw: number,
): CustomerService {
  const service = createService(
    customer,
    draw < CONFIG.recommendationChance ? 'greeting' : 'ordered',
  );
  if (service.stage === 'ordered') {
    const menu = PRODUCTS[customer.product].name;
    const orders: Record<Archetype, string[]> = {
      student: [
        `Satu ${menu}, ya. Untuk menemani belajar.`,
        `Satu gelas ${menu}, ya!`,
        `Mampir sepulang sekolah. Satu ${menu}, ya.`,
      ],
      university: [
        `Saya pesan ${menu}. Masih ada tugas yang harus diselesaikan.`,
        `Satu ${menu}, ya. Saya mau belajar sebentar di sini.`,
        `Baru selesai kuliah. Satu gelas ${menu}, ya.`,
      ],
      worker: [
        `Satu ${menu} sebelum kembali bekerja, ya.`,
        `Satu ${menu}, ya. Saya sedang istirahat sebentar.`,
        `Selamat siang. Satu ${menu}, ya.`,
      ],
      blogger: [
        `Saya ingin mencoba ${menu} hari ini. Satu, ya!`,
        `Saya sudah lihat menunya. Satu ${menu}, ya.`,
        `Minuman ${menu} kelihatannya menarik. Saya pesan satu gelas.`,
      ],
      loyal: [
        `Mampir lagi! Satu ${menu} untuk hari ini, ya.`,
        `Halo! Satu ${menu} untuk dinikmati sore ini.`,
        `Senang kembali ke sini. Saya pesan ${menu}, ya.`,
      ],
    };
    service.line = orders[customer.archetype][service.variant];
  }
  return service;
}

const greetings: Record<Archetype, string[]> = {
  student: [
    'Sepulang sekolah ingin yang manis. Ada yang sesuai uang saku saya?',
    'Mampir sebelum belajar kelompok. Ada minuman apa saja?',
    'Ingin jajan minuman, tapi uang saku saya terbatas.',
  ],
  university: [
    'Masih banyak tugas. Perlu minuman untuk menemani belajar malam ini.',
    'Baru selesai kuliah. Ingin minuman dengan rasa kopi yang kuat.',
    'Saya mau mengerjakan tugas di sini. Ada rekomendasi minuman?',
  ],
  worker: [
    'Saya istirahat sebentar. Cari minuman enak sebelum kembali bekerja.',
    'Hari ini sibuk sekali. Ingin menikmati minuman yang dibuat dengan sepenuh hati.',
    'Mampir di sela pekerjaan. Bisa bantu pilih minuman?',
  ],
  blogger: [
    'Kafenya menyenangkan! Saya ingin mencoba minuman untuk diulas.',
    'Sedang mencari rasa baru untuk ulasan. Apa yang istimewa di sini?',
    'Halo! Saya senang menemukan kafe kecil dengan pelayanan berkesan.',
  ],
  loyal: [
    'Senang kembali ke sini. Masih ingat rasa favorit saya?',
    'Tempatnya nyaman sekali. Pilihkan minuman untuk menemani sore saya.',
    'Halo, saya kembali! Hari ini ingin minuman favorit seperti biasa.',
  ],
};
const thanks: Record<Archetype, string[]> = {
  student: [
    'Terjangkau dan cocok untuk jeda belajar. Terima kasih!',
    'Minumannya enak dan sesuai uang saku. Mantap!',
    'Lain kali saya ajak teman-teman sekolah.',
  ],
  university: [
    'Pas sekali untuk menemani mengerjakan tugas. Terima kasih!',
    'Aroma dan rasanya enak. Siap belajar lagi!',
    'Satu gelas, lalu kembali mengerjakan tugas. Terima kasih!',
  ],
  worker: [
    'Terima kasih. Istirahat singkat saya jadi lebih menyenangkan.',
    'Pas untuk menyegarkan pikiran sebelum kembali bekerja.',
    'Pelayanannya membuat saya ingin kembali.',
  ],
  blogger: [
    'Rasanya menarik! Pelayanannya akan saya ceritakan dalam ulasan.',
    'Ada cerita hangat di balik segelas minuman ini. Terima kasih!',
    'Kafe kecil dengan perhatian besar. Layak direkomendasikan.',
  ],
  loyal: [
    'Rasa ini membuat saya selalu kembali. Sampai jumpa!',
    'Selalu senang disambut di sini. Terima kasih.',
    'Kalian membuat tempat favorit saya terasa makin ramah.',
  ],
};

export function createService(
  customer: Pick<Customer, 'id' | 'archetype'>,
  stage: CustomerService['stage'] = 'greeting',
): CustomerService {
  // The ID provides stable variety without advancing the economic RNG.
  const variant = Array.from(customer.id).reduce((n, char) => n + char.charCodeAt(0), 0) % 3;
  return {
    stage,
    variant,
    askedTaste: false,
    askedBudget: false,
    refusals: 0,
    line:
      stage === 'ordered'
        ? 'Pesanan saya sudah dicatat. Silakan disiapkan.'
        : greetings[customer.archetype][variant],
    style: null,
    startedAt: null,
    readyAt: null,
  };
}

export function remainingPatience(customer: Customer, elapsed: number): number {
  return Math.max(0, customer.patience - (elapsed - customer.arrivedAt));
}
export function customerSpeech(customer: Customer, elapsed: number): string {
  const remaining = remainingPatience(customer, elapsed);
  if (remaining <= 10 && customer.service.stage !== 'ready') {
    return customer.archetype === 'worker'
      ? 'Maaf, saya harus segera kembali bekerja. Bagaimana pesanan saya?'
      : [
          'Saya sudah menunggu cukup lama. Bisa dibantu?',
          'Saya harus segera pergi. Bagaimana pesanan saya?',
          'Semoga masih sempat menikmati minuman sebelum pergi.',
        ][customer.service.variant];
  }
  return customer.service.line;
}
export function tasteReply(customer: Customer): string {
  const favorite = PRODUCTS[PEOPLE[customer.archetype].favorite].name;
  return {
    student: `Saya suka minuman lembut dan manis seperti ${favorite}. Harga tetap penting bagi saya.`,
    university: `${favorite} favorit saya. Kopi cocok menemani tugas, tapi saya mau mencoba yang lain.`,
    worker: `Biasanya ${favorite}. Kalau ada waktu, saya suka minuman yang dibuat dengan teliti.`,
    blogger: `Saya penasaran dengan ${favorite}. Saya akan mengulas rasa dan pelayanannya.`,
    loyal: `Favorit saya ${favorite}. Senang sekali kalau masih diingat.`,
  }[customer.archetype];
}
export function thankYou(customer: Customer): string {
  const line = thanks[customer.archetype][customer.service.variant];
  return customer.service.style === 'careful'
    ? `${line} Terasa sekali perhatian dalam meraciknya.`
    : line;
}

/** Reserve recipe quantities for drinks already on the bar without charging cash or COGS. */
export function brewingCapacity(
  session: Session,
  product: ProductId,
  excludingId?: string,
): number {
  const inventory = structuredClone(session.inventory);
  for (const other of session.day.customers) {
    if (other.id === excludingId || !['preparing', 'ready'].includes(other.service.stage)) continue;
    if (capacity(inventory, other.product) < 1) return 0;
    for (const [id, quantity] of Object.entries(PRODUCTS[other.product].recipe)) {
      consume(inventory, id as keyof typeof inventory, quantity);
    }
  }
  return capacity(inventory, product);
}
