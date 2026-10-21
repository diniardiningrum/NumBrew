export const money = (n: number): string =>
  `${n < 0 ? '−' : ''}Rp${Math.abs(n).toLocaleString('id-ID')}`;
export const number = (n: number): string => n.toLocaleString('id-ID');
export const percent = (n: number | null): string =>
  n === null ? '—' : `${n.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`;
export function gameTime(seconds: number, duration: number): string {
  const minutes = 8 * 60 + Math.min(1, seconds / duration) * 8 * 60;
  return `${Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(minutes % 60)
    .toString()
    .padStart(2, '0')}`;
}
