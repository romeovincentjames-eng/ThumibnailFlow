import { getCurrentUser } from "@/lib/auth/server";
import { getRepository } from "@/lib/repository";

export async function getOrCreateBillingAccount() {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("AUTH_REQUIRED");
  }

  const repository = getRepository();
  const existing = await repository.getBillingAccountByUserId(user.id);
  if (existing) {
    if (user.email && existing.email !== user.email) {
      return (await repository.updateBillingAccount(existing.id, { email: user.email })) ?? existing;
    }

    return existing;
  }

  return repository.createBillingAccount({
    userId: user.id,
    email: user.email ?? null
  });
}

export async function getCurrentBillingAccount() {
  const user = await getCurrentUser();
  if (!user) return null;

  const repository = getRepository();
  const account = await repository.getBillingAccountByUserId(user.id);
  if (account && user.email && account.email !== user.email) {
    return (await repository.updateBillingAccount(account.id, { email: user.email })) ?? account;
  }

  return account;
}
