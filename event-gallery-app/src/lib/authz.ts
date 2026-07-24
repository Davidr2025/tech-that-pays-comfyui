import { db } from "./db";
import type { Role } from "@prisma/client";

const ROLE_RANK: Record<Role, number> = { STAFF: 0, ADMIN: 1, OWNER: 2 };

/**
 * Finds the caller's effective role for a sub-account: either a direct
 * membership on that sub-account, or an org-wide membership (subAccountId
 * null) that grants access to every sub-account under the org.
 */
export async function getSubAccountRole(userId: string, subAccountId: string): Promise<Role | null> {
  const subAccount = await db.subAccount.findUnique({
    where: { id: subAccountId },
    select: { organizationId: true },
  });
  if (!subAccount) return null;

  const memberships = await db.membership.findMany({
    where: {
      userId,
      organizationId: subAccount.organizationId,
      OR: [{ subAccountId }, { subAccountId: null }],
    },
  });
  const first = memberships[0];
  if (!first) return null;

  return memberships.reduce<Role>((best, m) => (ROLE_RANK[m.role] > ROLE_RANK[best] ? m.role : best), first.role);
}

export async function requireSubAccountRole(userId: string, subAccountId: string, minRole: Role) {
  const role = await getSubAccountRole(userId, subAccountId);
  if (!role || ROLE_RANK[role] < ROLE_RANK[minRole]) {
    throw new Response("Forbidden", { status: 403 });
  }
  return role;
}

export async function getOrganizationRole(userId: string, organizationId: string): Promise<Role | null> {
  const membership = await db.membership.findFirst({
    where: { userId, organizationId, subAccountId: null },
  });
  return membership?.role ?? null;
}
