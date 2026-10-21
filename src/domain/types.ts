import type { Archetype, IngredientId, ProductId } from '../data/catalog';

export type Phase = 'preparation' | 'open' | 'closing' | 'report';
export interface Batch {
  id: string;
  quantity: number;
  consumed: number;
  cost: number;
}
export type Inventory = Record<IngredientId, Batch[]>;
export interface MenuItem {
  active: boolean;
  price: number;
  calculatedHpp?: number;
  discountPercent?: number;
}
export interface Customer {
  id: string;
  name: string;
  archetype: Archetype;
  product: ProductId;
  budget: number;
  price: number;
  discount?: number;
  discountPercent?: number;
  arrivedAt: number;
  patience: number;
  service: CustomerService;
}
// Previous styles remain readable for saved orders already in preparation.
export type BrewStyle = 'standard' | 'careful' | 'quick';
export interface CustomerService {
  stage: 'greeting' | 'ordered' | 'preparing' | 'ready';
  variant: number;
  askedTaste: boolean;
  askedBudget: boolean;
  refusals: number;
  line: string;
  style: BrewStyle | null;
  startedAt: number | null;
  readyAt: number | null;
}
export interface ServiceReaction {
  customerId: string;
  name: string;
  archetype: Archetype;
  line: string;
  contribution: number;
  reputationDelta: number;
}
export interface CostLine {
  ingredient: IngredientId;
  quantity: number;
  cost: number;
}
export interface Receipt {
  id: string;
  customerId: string;
  customer: string;
  product: ProductId;
  day: number;
  price: number;
  discount: number;
  discountPercent?: number;
  tax: number;
  hpp: number;
  lines: CostLine[];
  time: number;
}
export interface CashMovement {
  id: string;
  day: number;
  kind: 'purchase' | 'sale' | 'operating';
  amount: number;
  description: string;
}
export interface Report {
  day: number;
  revenue: number;
  discount: number;
  netRevenue: number;
  hpp: number;
  operating: number;
  tax: number;
  profit: number;
  calculatedProfit?: number;
  profitPct: number | null;
  customers: number;
  visitors: number;
  missed: number;
  reputationChange: number;
  cashStart: number;
  purchases: number;
  cashEnd: number;
  inventoryValue: number;
  receipts: Receipt[];
}
export type MissReason =
  'over_budget' | 'no_available_menu' | 'low_interest' | 'queue_full' | 'wait_timeout' | 'closing';
export interface Day {
  number: number;
  phase: Phase;
  elapsed: number;
  closeAt: number;
  nextArrival: number;
  customerSequence: number;
  cashStart: number;
  reputationStart: number;
  operatingCost: number;
  duration: number;
  taxRateBps: number;
  purchases: number;
  visitors: number;
  missed: Record<MissReason, number>;
  customers: Customer[];
  receipts: Receipt[];
  settled: boolean;
}
export interface Session {
  id: string;
  revision: number;
  dataVersion: number;
  rng: number;
  cash: number;
  reputation: number;
  inventory: Inventory;
  menu: Record<ProductId, MenuItem>;
  day: Day;
  reports: Report[];
  ledger: CashMovement[];
  tutorialSeen: boolean;
}
export interface GameResult {
  state: Session;
  message: string;
  error?: boolean;
  receipt?: Receipt;
  reaction?: ServiceReaction;
}
