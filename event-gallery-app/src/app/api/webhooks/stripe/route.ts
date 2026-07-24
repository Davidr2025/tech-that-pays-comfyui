import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, planTierForPriceId } from "@/lib/stripe";
import { db } from "@/lib/db";

/**
 * Stripe webhook — keeps Organization.planTier in sync with the
 * subscription. Configure this URL (APP_BASE_URL + /api/webhooks/stripe) in
 * the Stripe dashboard and set STRIPE_WEBHOOK_SECRET from the signing
 * secret it gives you.
 */
export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const organizationId = session.metadata?.organizationId;
      if (organizationId && session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        await syncSubscriptionToOrg(organizationId, subscription);
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const organizationId = subscription.metadata?.organizationId;
      if (organizationId) {
        await syncSubscriptionToOrg(organizationId, subscription);
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

async function syncSubscriptionToOrg(organizationId: string, subscription: Stripe.Subscription) {
  const priceId = subscription.items.data[0]?.price.id;
  const isActive = subscription.status === "active" || subscription.status === "trialing";
  const planTier = isActive && priceId ? (planTierForPriceId(priceId) ?? "FREE") : "FREE";

  await db.organization.update({
    where: { id: organizationId },
    data: {
      planTier,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId ?? null,
      stripeCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
      stripeCancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });
}
