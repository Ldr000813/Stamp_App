import { isAdminEmail } from "@/lib/apiAuth";

// Ownership is decided by the spot_owners allowlist (email → spot). Admins can
// manage every spot. These helpers take a service-role db client.

/** Spot ids the caller may manage, or null meaning "all" (admin). */
export async function ownedSpotIds(db: any, email: string): Promise<string[] | null> {
  if (isAdminEmail(email)) return null;
  const { data } = await db.from("spot_owners").select("spot_id").eq("email", email.toLowerCase());
  return (data || []).map((r: any) => r.spot_id);
}

/** Whether the caller may manage a specific spot. */
export async function canManageSpot(db: any, email: string, spotId: string | null): Promise<boolean> {
  if (isAdminEmail(email)) return true;
  if (!spotId) return false;
  const { data } = await db.from("spot_owners")
    .select("spot_id").eq("spot_id", spotId).eq("email", email.toLowerCase()).maybeSingle();
  return !!data;
}
