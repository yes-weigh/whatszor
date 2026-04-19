import { PlanTier } from "@prisma/client";

export interface PlanLimit {
  maxAgents: number;
  maxContacts: number;
  maxBroadcastMessagesPerMonth: number;
  dailyResponseLimit: number | null;
  storageLimitBytes: bigint;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimit> = {
  [PlanTier.FREE]: {
    maxAgents: 1,
    maxContacts: 100,
    maxBroadcastMessagesPerMonth: 0, 
    dailyResponseLimit: 100, 
    storageLimitBytes: BigInt(10 * 1024 * 1024), // 10MB
  },
  [PlanTier.STARTER]: {
    maxAgents: 3,
    maxContacts: 2000,
    maxBroadcastMessagesPerMonth: 10000,
    dailyResponseLimit: null, 
    storageLimitBytes: BigInt(500 * 1024 * 1024), // 500MB
  },
  [PlanTier.PRO]: {
    maxAgents: 10,
    maxContacts: 10000,
    maxBroadcastMessagesPerMonth: 50000,
    dailyResponseLimit: null, 
    storageLimitBytes: BigInt(2 * 1024 * 1024 * 1024), // 2GB
  },
  [PlanTier.AGENCY]: {
    maxAgents: 9999, // practically unlimited
    maxContacts: 100000,
    maxBroadcastMessagesPerMonth: 500000,
    dailyResponseLimit: null,
    storageLimitBytes: BigInt(10 * 1024 * 1024 * 1024), // 10GB
  },
};
