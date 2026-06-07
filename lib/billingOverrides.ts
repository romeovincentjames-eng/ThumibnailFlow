import { getEnv } from "@/lib/env";
import type { BillingAccount } from "@/lib/types";

export const UNLIMITED_POINTS_BALANCE = 999_999_999;

const OWNER_UNLIMITED_EMAILS = ["romeovincentjames@icloud.com"];

export function isUnlimitedCreditEmail(email?: string | null) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  return getUnlimitedCreditEmails().includes(normalized);
}

export function isUnlimitedBillingAccount(account?: Pick<BillingAccount, "email"> | null) {
  return isUnlimitedCreditEmail(account?.email);
}

export function applyBillingAccountOverrides<T extends BillingAccount | null>(account: T): T {
  if (!account || !isUnlimitedBillingAccount(account)) return account;

  return {
    ...account,
    planKey: "agency",
    stripeSubscriptionStatus: account.stripeSubscriptionStatus ?? "active",
    pointsBalance: UNLIMITED_POINTS_BALANCE,
    lifetimePointsPurchased: Math.max(account.lifetimePointsPurchased, UNLIMITED_POINTS_BALANCE)
  } as T;
}

function getUnlimitedCreditEmails() {
  const configured = getEnv("UNLIMITED_CREDIT_EMAILS")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);

  return [...new Set([...OWNER_UNLIMITED_EMAILS, ...configured])];
}

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() ?? "";
}
