import Stripe from "stripe";
import { getEnv, hasStripeConfig } from "@/lib/env";

let stripeClient: Stripe | null = null;

export function getStripeClient() {
  if (!hasStripeConfig()) return null;

  if (!stripeClient) {
    stripeClient = new Stripe(getEnv("STRIPE_SECRET_KEY"));
  }

  return stripeClient;
}

export function getAppBaseUrl(request?: Request) {
  const configured = getEnv("NEXT_PUBLIC_APP_URL");
  if (configured) return configured.replace(/\/$/, "");

  if (request) {
    const origin = request.headers.get("origin");
    if (origin) return origin;
  }

  return "http://localhost:3000";
}
