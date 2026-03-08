// Feature flags (public: NEXT_PUBLIC_* so they can be used in client bundles).
// Default: disabled unless explicitly set to "true".

export const ENABLE_LAND = process.env.NEXT_PUBLIC_ENABLE_LAND === 'true'
export const LAND_PUBLIC_STATUS = ENABLE_LAND ? 'beta' : 'preparing'
export const ENABLE_FREE_OPEN_MODE =
  process.env.NEXT_PUBLIC_ENABLE_FREE_OPEN_MODE === 'true'
