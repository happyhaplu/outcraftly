export const USER_PLAN_VALUES = ['Trial', 'Starter', 'Pro', 'Scale', 'Scale Plus'] as const;

export type UserPlan = (typeof USER_PLAN_VALUES)[number];

export type PlanUsageLimits = {
  prospects: number;
  emailsPerMonth: number;
  credits: number;
};

export type PlanDefinition = {
  name: UserPlan;
  limits: PlanUsageLimits;
  isActive?: boolean;
  isTrial?: boolean;
  sortOrder: number;
};

export const DEFAULT_PLAN_DEFINITIONS: PlanDefinition[] = [
  {
    name: 'Trial',
    limits: {
      prospects: 50,
      emailsPerMonth: 100,
      credits: 25
    },
    isActive: true,
    isTrial: true,
    sortOrder: 0
  },
  {
    name: 'Starter',
    limits: {
      prospects: 500,
      emailsPerMonth: 2000,
      credits: 100
    },
    isActive: true,
    sortOrder: 1
  },
  {
    name: 'Pro',
    limits: {
      prospects: 2500,
      emailsPerMonth: 10000,
      credits: 500
    },
    isActive: true,
    sortOrder: 2
  },
  {
    name: 'Scale',
    limits: {
      prospects: 10000,
      emailsPerMonth: 50000,
      credits: 2000
    },
    isActive: true,
    sortOrder: 3
  },
  {
    name: 'Scale Plus',
    limits: {
      prospects: 30000,
      emailsPerMonth: 150000,
      credits: 5000
    },
    isActive: true,
    sortOrder: 4
  }
];

export const DEFAULT_PLAN_USAGE_LIMITS: Record<UserPlan, PlanUsageLimits> = DEFAULT_PLAN_DEFINITIONS.reduce(
  (acc, definition) => {
    acc[definition.name] = definition.limits;
    return acc;
  },
  {} as Record<UserPlan, PlanUsageLimits>
);

export const DEFAULT_USER_PLAN: UserPlan = 'Starter';
export const TRIAL_PLAN_NAME: UserPlan = 'Trial';
