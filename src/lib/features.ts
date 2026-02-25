// Feature flags (public: NEXT_PUBLIC_* so they can be used in client bundles).
// Default: disabled unless explicitly set to "true".

export const ENABLE_LAND = process.env.NEXT_PUBLIC_ENABLE_LAND !== 'false'
export const ENABLE_FREE_OPEN_MODE =
  process.env.NEXT_PUBLIC_FREE_OPEN_MODE === 'true'
