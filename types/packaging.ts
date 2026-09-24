export interface Packaging {
  id: string;
  size: number;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const PACKAGING_SIZES = [100, 200, 500, 1000, 2000, 5000] as const;

export function packagingDisplay(size: number): string {
  if (size >= 1000 && size % 1000 === 0) return `${size / 1000}kg`;
  return `${size}gms`;
}
