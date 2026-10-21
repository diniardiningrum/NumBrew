// Original, editable vector assets for menu cards and inventory. Not generated screenshots.
import { writeFileSync, mkdirSync } from 'node:fs';
const svg = (body, view = '0 0 160 180') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}">${body}</svg>`;
mkdirSync('public/assets/products', { recursive: true });
mkdirSync('public/assets/ingredients', { recursive: true });
for (const [id, color, dark, foam] of [
  ['matcha-latte', '#a0b282', '#6d8751', '#f5ead1'],
  ['coffee-latte', '#bf9776', '#865f42', '#f8e9cf'],
  ['cocoa-latte', '#ae8269', '#76513d', '#edddc0'],
]) {
  writeFileSync(
    `public/assets/products/${id}.svg`,
    svg(
      `<defs><linearGradient id="drink" x1="0" y1="0" x2="1" y2="0"><stop stop-color="${color}"/><stop offset=".7" stop-color="${color}"/><stop offset="1" stop-color="${dark}"/></linearGradient><linearGradient id="cream" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff8e7"/><stop offset="1" stop-color="${foam}"/></linearGradient></defs><ellipse cx="81" cy="158" rx="39" ry="7" fill="#796449" opacity=".12"/><path d="M45 57h71l-9 88q-1 9-26 10-25-1-27-10z" fill="url(#drink)" stroke="#7f7151" stroke-width="2"/><path d="M45 57h71l-3 26q-31 8-66 0z" fill="url(#cream)"/><ellipse cx="80" cy="57" rx="36" ry="10" fill="#e7dfc0" stroke="#7f7151" stroke-width="2"/><ellipse cx="80" cy="57" rx="30" ry="6.5" fill="${dark}"/><path d="M84 59c-9-10-15 0-4 2 12 1 17-6 10-7-6-1-11 5-4 6" fill="none" stroke="#f9f1d8" stroke-width="1.5" stroke-linecap="round"/><path d="M52 85l6 55q0 4 7 5" fill="none" stroke="#fff8e6" stroke-opacity=".5" stroke-width="4" stroke-linecap="round"/><path d="M103 91l-4 47" fill="none" stroke="${dark}" stroke-opacity=".3" stroke-width="2"/><path d="M64 43c-11-8 7-12-1-21m17 21c-9-7 8-11 0-22m17 22c-10-6 8-12 0-19" fill="none" stroke="#b4aa8b" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/><ellipse cx="80" cy="114" rx="15" ry="17" fill="#f7efd5" fill-opacity=".85"/><path d="M75 120c-3-10 6-17 11-17 2 9-1 17-11 17m1-1 7-12" fill="none" stroke="${dark}" stroke-width="1.7" stroke-linecap="round"/>`,
    ),
  );
}
for (const [id, color, symbol] of [
  [
    'matcha',
    '#8eaa70',
    '<path d="M42 67c-4-15 8-24 18-23 0 14-5 24-18 23m1-2 12-15" fill="none" stroke="#eff0d4" stroke-width="3" stroke-linecap="round"/>',
  ],
  [
    'coffee',
    '#987452',
    '<ellipse cx="49" cy="55" rx="10" ry="15" fill="#e5cfab" transform="rotate(24 49 55)"/><path d="M53 42c-15 12 6 12-10 25" fill="none" stroke="#886246" stroke-width="2"/>',
  ],
  [
    'cocoa',
    '#ac8063',
    '<path d="M37 48l18-8 11 24-18 8z" fill="#70503f" stroke="#e6c7a4" stroke-width="2"/><path d="M46 44l11 24m-15-9 18-8" stroke="#e6c7a4" stroke-width="2"/>',
  ],
]) {
  writeFileSync(
    `public/assets/ingredients/${id}.svg`,
    svg(
      `<path d="M30 18h40l-3 12 9 49q2 8-27 8-26 0-24-8l8-49z" fill="${color}" stroke="#6d5844" stroke-width="2"/><path d="M30 18q20-7 40 0l-3 12H33z" fill="#d8b88b" stroke="#6d5844" stroke-width="2"/><path d="M34 19h32M33 31h34" stroke="#92714f" stroke-width="2"/>${symbol}<path d="M32 72l2 7" stroke="#ead5b6" stroke-width="3" stroke-linecap="round" opacity=".6"/>`,
      '0 0 100 100',
    ),
  );
}
writeFileSync(
  'public/assets/ingredients/milk.svg',
  svg(
    '<path d="M31 29l8-15h26l9 15v57H31z" fill="#eaf0dc" stroke="#68796e" stroke-width="2"/><path d="M31 29h43v17H31zm0 42h43v15H31z" fill="#a1bfc0"/><path d="M39 14v14l26 1V14m0 15 9 0" fill="none" stroke="#68796e" stroke-width="2"/><path d="M52 48c-1 7-9 11-9 18a9 9 0 0 0 18 0c0-7-8-11-9-18" fill="#a1bfc0"/><path d="M34 34h10" stroke="#e8f0da" stroke-width="2"/>',
    '0 0 100 100',
  ),
);
writeFileSync(
  'public/assets/ingredients/cup.svg',
  svg(
    '<path d="M25 28h44l-6 54q-18 8-32 0z" fill="#e2c69d" stroke="#8f7657" stroke-width="2"/><path d="M30 46h36l-3 23H33z" fill="#bfa079"/><path d="M23 23q24-7 48 0v8H23z" fill="#f4e6cc" stroke="#8f7657" stroke-width="2"/><ellipse cx="47" cy="55" rx="9" ry="11" fill="#e9d5b4"/><path d="M44 61q-6-13 9-15-1 15-9 15" fill="#8b9b6c"/><path d="M71 40h5l-4 43q-3 4-10 4" fill="#e7d2af" stroke="#8f7657" stroke-width="2"/>',
    '0 0 100 100',
  ),
);
