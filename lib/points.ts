import { getEnv } from "@/lib/env";
import type { BillingPlanKey, OutputFormat, ThumbnailCountOption } from "@/lib/types";

export const POINT_COSTS = {
  creativePackPerVideo: 2,
  thumbnailImage: 10,
  youtubeApply: 5,
  clippingAnalyzer: 20
} as const;

export type PaidPlanKey = Exclude<BillingPlanKey, "free">;
export type TopUpKey = "topup_200" | "topup_500" | "topup_1500";
export type CheckoutItemKind = "plan" | "topup";

export type BillingPlan = {
  key: PaidPlanKey;
  name: string;
  price: string;
  points: number;
  priceEnv: string;
  description: string;
  featured?: boolean;
};

export type TopUpPack = {
  key: TopUpKey;
  name: string;
  price: string;
  points: number;
  priceEnv: string;
};

export const BILLING_PLANS: BillingPlan[] = [
  {
    key: "starter",
    name: "Starter",
    price: "$19/mo",
    points: 300,
    priceEnv: "STRIPE_PRICE_STARTER",
    description: "For solo creators validating a thumbnail workflow."
  },
  {
    key: "creator",
    name: "Creator",
    price: "$49/mo",
    points: 900,
    priceEnv: "STRIPE_PRICE_CREATOR",
    description: "For channels publishing multiple videos every week.",
    featured: true
  },
  {
    key: "pro",
    name: "Pro",
    price: "$99/mo",
    points: 2000,
    priceEnv: "STRIPE_PRICE_PRO",
    description: "For frequent publishing teams with deeper batch volume."
  },
  {
    key: "agency",
    name: "Agency",
    price: "$199/mo",
    points: 4500,
    priceEnv: "STRIPE_PRICE_AGENCY",
    description: "For production teams and multi-channel operators."
  }
];

export const TOP_UP_PACKS: TopUpPack[] = [
  {
    key: "topup_200",
    name: "200 points",
    price: "$15",
    points: 200,
    priceEnv: "STRIPE_PRICE_TOPUP_200"
  },
  {
    key: "topup_500",
    name: "500 points",
    price: "$29",
    points: 500,
    priceEnv: "STRIPE_PRICE_TOPUP_500"
  },
  {
    key: "topup_1500",
    name: "1,500 points",
    price: "$79",
    points: 1500,
    priceEnv: "STRIPE_PRICE_TOPUP_1500"
  }
];

export function getCheckoutItem(kind: CheckoutItemKind, key: string) {
  if (kind === "plan") {
    return BILLING_PLANS.find((plan) => plan.key === key) ?? null;
  }

  return TOP_UP_PACKS.find((pack) => pack.key === key) ?? null;
}

export function getStripePriceId(priceEnv: string) {
  return getEnv(priceEnv);
}

export function estimateBatchPoints(input: {
  videoCount: number;
  totalImages: number;
}) {
  return input.videoCount * POINT_COSTS.creativePackPerVideo + input.totalImages * POINT_COSTS.thumbnailImage;
}

export function estimateVideoPoints(input: {
  thumbnailCount: number | ThumbnailCountOption;
  formatCount: number;
}) {
  return (
    POINT_COSTS.creativePackPerVideo +
    Number(input.thumbnailCount) * input.formatCount * POINT_COSTS.thumbnailImage
  );
}

export function estimateConceptPoints(formats: OutputFormat[]) {
  return formats.length * POINT_COSTS.thumbnailImage;
}

export function estimateThumbnailPoints() {
  return POINT_COSTS.thumbnailImage;
}

export function isInsufficientPointsError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /INSUFFICIENT_POINTS|points_balance|insufficient points/i.test(message);
}
