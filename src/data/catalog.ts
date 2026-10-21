export type IngredientId = 'matcha' | 'coffee' | 'cocoa' | 'milk' | 'cup';
export type ProductId = 'matcha-latte' | 'coffee-latte' | 'cocoa-latte';
export type Archetype = 'student' | 'university' | 'worker' | 'blogger' | 'loyal';

export const CONFIG = {
  dataVersion: 1,
  initialCash: 500_000,
  operatingCost: 20_000,
  initialReputation: 50,
  daySeconds: 180,
  closingSeconds: 30,
  taxRateBps: 0,
  maxCash: 1_000_000_000,
  maxPrice: 100_000,
  maxQueue: 3,
  arrivalMinSeconds: 12,
  arrivalMaxSeconds: 18,
  recommendationChance: 0.3,
  preparationSeconds: 6,
  maxDiscountPercent: 50,
} as const;

export const INGREDIENTS: Record<
  IngredientId,
  {
    name: string;
    unit: 'g' | 'ml' | 'buah';
    pack: number;
    cost: number;
    color: string;
    hint: string;
  }
> = {
  matcha: {
    name: 'Bubuk matcha',
    unit: 'g',
    pack: 500,
    cost: 60_000,
    color: '#829565',
    hint: 'Lembut dengan aroma teh',
  },
  coffee: {
    name: 'Bubuk kopi',
    unit: 'g',
    pack: 400,
    cost: 48_000,
    color: '#8f6548',
    hint: 'Aroma yang akrab',
  },
  cocoa: {
    name: 'Bubuk kakao',
    unit: 'g',
    pack: 500,
    cost: 30_000,
    color: '#ac795b',
    hint: 'Manis dan menenangkan',
  },
  milk: {
    name: 'Susu segar',
    unit: 'ml',
    pack: 1000,
    cost: 18_000,
    color: '#a1bdc0',
    hint: 'Cocok untuk setiap racikan susu',
  },
  cup: {
    name: 'Gelas & tutup',
    unit: 'buah',
    pack: 20,
    cost: 30_000,
    color: '#caaa7b',
    hint: 'Siap dibawa',
  },
};

export const PRODUCTS: Record<
  ProductId,
  {
    name: string;
    short: string;
    color: string;
    description: string;
    recipe: Partial<Record<IngredientId, number>>;
  }
> = {
  'matcha-latte': {
    name: 'Matcha susu',
    short: 'Matcha',
    color: '#81966a',
    description: 'Matcha lembut berpadu susu segar.',
    recipe: { matcha: 10, milk: 200, cup: 1 },
  },
  'coffee-latte': {
    name: 'Kopi susu',
    short: 'Kopi',
    color: '#a57a57',
    description: 'Kopi hangat untuk obrolan panjang.',
    recipe: { coffee: 10, milk: 200, cup: 1 },
  },
  'cocoa-latte': {
    name: 'Cokelat susu',
    short: 'Cokelat',
    color: '#9f6857',
    description: 'Cokelat untuk memaniskan harimu.',
    recipe: { cocoa: 15, milk: 200, cup: 1 },
  },
};

export const PEOPLE: Record<
  Archetype,
  {
    label: string;
    names: string[];
    budget: [number, number];
    favorite: ProductId;
    patience: number;
    sensitivity: number;
    shirt: number;
    hair: number;
    skin: number;
  }
> = {
  student: {
    label: 'Pelajar',
    names: ['Yuni'],
    budget: [8_000, 12_000],
    favorite: 'cocoa-latte',
    patience: 45,
    sensitivity: 0.8,
    shirt: 0xc59a59,
    hair: 0x3f2b26,
    skin: 0xdba77e,
  },
  university: {
    label: 'Mahasiswa',
    names: ['Pahri'],
    budget: [10_000, 16_000],
    favorite: 'coffee-latte',
    patience: 50,
    sensitivity: 0.6,
    shirt: 0x6f855b,
    hair: 0x382c29,
    skin: 0xd2a077,
  },
  worker: {
    label: 'Pekerja kantoran',
    names: ['Wahyu'],
    budget: [13_000, 20_000],
    favorite: 'coffee-latte',
    patience: 40,
    sensitivity: 0.25,
    shirt: 0x839ba0,
    hair: 0x342c29,
    skin: 0xbc855e,
  },
  blogger: {
    label: 'Pengulas kuliner',
    names: ['Sri'],
    budget: [12_000, 22_000],
    favorite: 'matcha-latte',
    patience: 45,
    sensitivity: 0.35,
    shirt: 0xb66e51,
    hair: 0x46332c,
    skin: 0xe1b38b,
  },
  loyal: {
    label: 'Pelanggan tetap',
    names: ['Adam'],
    budget: [10_000, 18_000],
    favorite: 'matcha-latte',
    patience: 60,
    sensitivity: 0.4,
    shirt: 0x77738d,
    hair: 0x51483b,
    skin: 0xc99972,
  },
};

export const CHARACTER_ASSETS: Record<Archetype, string> = {
  student: 'yuni',
  university: 'pahri',
  worker: 'wahyu',
  blogger: 'sri',
  loyal: 'adam',
};

export const ingredientIds = Object.keys(INGREDIENTS) as IngredientId[];
export const productIds = Object.keys(PRODUCTS) as ProductId[];
export const archetypes = Object.keys(PEOPLE) as Archetype[];
export const STARTER_CART: Record<IngredientId, number> = {
  matcha: 1,
  coffee: 1,
  cocoa: 1,
  milk: 4,
  cup: 1,
};
