/**
 * Storage limits by plan tier.
 * Free & Pro Trial: 50 GB | Pro paid: 1 TB
 */
export const STORAGE_LIMITS: Record<string, number> = {
  free: 50 * 1024 * 1024 * 1024,          // 50 GB
  pro_trial: 50 * 1024 * 1024 * 1024,     // 50 GB (capped to prevent abuse)
  pro: 1024 * 1024 * 1024 * 1024,         // 1 TB
};

/** Resolve the storage limit for a given plan string. */
export function getStorageLimit(plan: string | null | undefined): number {
  if (!plan) return STORAGE_LIMITS.free;
  return STORAGE_LIMITS[plan] ?? STORAGE_LIMITS.free;
}
