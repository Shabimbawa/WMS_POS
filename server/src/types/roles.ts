export const PROFILE_ROLES = ["warehouse_admin", "pos_admin"] as const;
export type ProfileRole = (typeof PROFILE_ROLES)[number];

