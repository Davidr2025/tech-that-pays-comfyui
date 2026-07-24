import type { Organization, PlanTier } from "@prisma/client";

interface PlanLimits {
  label: string;
  maxSubAccounts: number;
  permanentStorageAllowed: boolean;
  whiteLabelAllowed: boolean;
  externalStorageSyncAllowed: boolean;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  FREE: {
    label: "Free",
    maxSubAccounts: 1,
    permanentStorageAllowed: false,
    whiteLabelAllowed: false,
    externalStorageSyncAllowed: false,
  },
  PRO: {
    label: "Pro",
    maxSubAccounts: 3,
    permanentStorageAllowed: true,
    whiteLabelAllowed: false,
    externalStorageSyncAllowed: true,
  },
  AGENCY: {
    label: "Agency",
    maxSubAccounts: Infinity,
    permanentStorageAllowed: true,
    whiteLabelAllowed: true,
    externalStorageSyncAllowed: true,
  },
};

export function limitsForOrg(org: Pick<Organization, "planTier">): PlanLimits {
  return PLAN_LIMITS[org.planTier];
}

export function canAddSubAccount(org: Pick<Organization, "planTier">, currentCount: number) {
  return currentCount < limitsForOrg(org).maxSubAccounts;
}
