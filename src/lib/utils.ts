import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(price: number): string {
  if (price >= 100000000) {
    const billion = Math.floor(price / 100000000)
    const million = Math.floor((price % 100000000) / 10000000)
    return million > 0 ? `${billion}억 ${million}천만원` : `${billion}억원`
  }
  if (price >= 10000000) {
    return `${Math.floor(price / 10000000)}천만원`
  }
  if (price >= 10000) {
    return `${Math.floor(price / 10000)}만원`
  }
  return `${price}원`
}

export function formatArea(area: number): string {
  return `${area.toFixed(1)}㎡`
}

export function formatDate(date: string | Date): string {
  const d = new Date(date)
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
