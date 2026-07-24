import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2024-06-20",
});

/** Maps a Stripe Price ID (from env) to the plan tier it unlocks. */
export function planTierForPriceId(priceId: string): "PRO" | "AGENCY" | null {
  if (priceId === process.env.STRIPE_PRICE_PRO) return "PRO";
  if (priceId === process.env.STRIPE_PRICE_AGENCY) return "AGENCY";
  return null;
}
