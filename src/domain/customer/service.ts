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
        `One ${menu}, please. Something to enjoy while studying.`,
        `One cup of ${menu}, please!`,
        `Stopping by after school. One ${menu}, please.`,
      ],
      university: [
        `I will have a ${menu}. Still have assignments to finish.`,
        `One ${menu}, please. I am staying to study for a while.`,
        `Just finished class. One cup of ${menu}, please.`,
      ],
      worker: [
        `One ${menu} before I head back to work, please.`,
        `One ${menu}, please. I am on a short break.`,
        `Good afternoon. One ${menu}, please.`,
      ],
      blogger: [
        `I would like to try the ${menu} today. One, please!`,
        `I have checked the menu. One ${menu}, please.`,
        `The ${menu} looks interesting. I will have one cup.`,
      ],
      loyal: [
        `Back again! One ${menu} today, please.`,
        `Hello! One ${menu} to enjoy this afternoon.`,
        `Good to be back. I will have a ${menu}, please.`,
      ],
    };
    service.line = orders[customer.archetype][service.variant];
  }
  return service;
}

const greetings: Record<Archetype, string[]> = {
  student: [
    'I feel like something sweet after school. Anything within my pocket money?',
    'Stopping by before a study group. What drinks do you have?',
    'I feel like a treat, but my pocket money is limited.',
  ],
  university: [
    'Lots of assignments left. I need a drink for a late study night.',
    'Just finished class. I feel like a drink with a rich coffee flavor.',
    'I am settling in to work on an assignment. Any drink recommendations?',
  ],
  worker: [
    'I have a short break. Looking for a good drink before heading back to work.',
    'It has been a busy day. I would love a carefully made drink.',
    'Stopping by between tasks. Can you help me choose a drink?',
  ],
  blogger: [
    'Lovely cafe! I would like to try a drink worth writing about.',
    'Looking for new flavors for my review. What is special here?',
    'Hello! I love finding little cafes with memorable service.',
  ],
  loyal: [
    'Good to be back. Do you remember my favorite flavor?',
    'Such a cozy spot. Pick something for me to enjoy this afternoon.',
    'Hello, back again! I feel like a familiar favorite today.',
  ],
};
const thanks: Record<Archetype, string[]> = {
  student: [
    'Affordable and great for a study break. Thank you!',
    'A tasty drink within my pocket money. Nice!',
    'I will bring my school friends next time.',
  ],
  university: [
    'Just what I needed for my assignment. Thanks!',
    'Great aroma and flavor. Ready to get back to studying!',
    'One cup, then back to my assignments. Thank you!',
  ],
  worker: [
    'Thank you. That made my short break much better.',
    'Just right for clearing my head before going back to work.',
    'Good service makes me want to come back.',
  ],
  blogger: [
    'Interesting flavor! I will mention the service in my review.',
    'There is a warm story behind this cup. Thank you!',
    'A little cafe with a lot of care. Worth recommending.',
  ],
  loyal: [
    'That taste keeps me coming back. See you again!',
    'Always happy to be welcomed here. Thank you.',
    'You make my favorite spot feel even more welcoming.',
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
        ? 'My order has been taken. Please go ahead and prepare it.'
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
      ? 'Sorry, I need to get back to work soon. How is my order coming along?'
      : [
          'I have been waiting a while. Could you help me, please?',
          'I need to leave soon. How is my order coming along?',
          'I hope there is still time to enjoy my drink before I leave.',
        ][customer.service.variant];
  }
  return customer.service.line;
}
export function tasteReply(customer: Customer): string {
  const favorite = PRODUCTS[PEOPLE[customer.archetype].favorite].name;
  return {
    student: `I like smooth, sweet drinks like ${favorite}. Price still matters to me.`,
    university: `${favorite} is my favorite. Coffee goes well with assignments, but I am open to other drinks.`,
    worker: `Usually ${favorite}. When there is time, I appreciate a carefully made drink.`,
    blogger: `I am curious about ${favorite}. I will write about the flavor and service.`,
    loyal: `My favorite is ${favorite}. It means a lot when you remember.`,
  }[customer.archetype];
}
export function thankYou(customer: Customer): string {
  const line = thanks[customer.archetype][customer.service.variant];
  return customer.service.style === 'careful'
    ? `${line} I can taste the care that went into it.`
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
