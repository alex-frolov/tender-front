import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Утилита для склейки Tailwind-классов с корректным разрешением конфликтов.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}