// Feature flags (public: NEXT_PUBLIC_* so they can be used in client bundles).
// Default: disabled unless explicitly set to "true".

export const ENABLE_LAND = process.env.NEXT_PUBLIC_ENABLE_LAND !== 'false'
// Billing is fully removed: keep platform permanently in free-open mode.
export const ENABLE_FREE_OPEN_MODE = true
