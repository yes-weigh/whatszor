import { PlanTier } from "@prisma/client";

export interface PlanLimit {
  maxWhatsAppAccounts: number;
  maxAgents: number;
  maxContacts: number;
  storageLimitBytes: bigint;
  maxMediaFiles: number;
  maxTemplates: number;
  maxCampaignsPerDay: number;
  maxBroadcastMessagesPerMonth: number;
  maxAutoReplyRules: number;
  leadsVisiblePerSearch: number;
  leadsExtractedPerDay: number;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimit> = {
  [PlanTier.FREE]: {
    maxWhatsAppAccounts: 1,
    maxAgents: 1,
    maxContacts: 100,
    storageLimitBytes: BigInt(100 * 1024 * 1024), // 100MB
    maxMediaFiles: 10,
    maxTemplates: 3,
    maxCampaignsPerDay: 3,
    maxBroadcastMessagesPerMonth: 500, 
    maxAutoReplyRules: 3, 
    leadsVisiblePerSearch: 5,
    leadsExtractedPerDay: 50,
  },
  [PlanTier.STARTER]: {
    maxWhatsAppAccounts: 2,
    maxAgents: 3,
    maxContacts: 2000,
    storageLimitBytes: BigInt(500 * 1024 * 1024), // 500MB
    maxMediaFiles: 100,
    maxTemplates: 20,
    maxCampaignsPerDay: 10,
    maxBroadcastMessagesPerMonth: 10000,
    maxAutoReplyRules: 10, 
    leadsVisiblePerSearch: 20,
    leadsExtractedPerDay: 200,
  },
  [PlanTier.PRO]: {
    maxWhatsAppAccounts: 5,
    maxAgents: 10,
    maxContacts: 10000,
    storageLimitBytes: BigInt(2 * 1024 * 1024 * 1024), // 2GB
    maxMediaFiles: 99999, // practically unlimited
    maxTemplates: 99999,
    maxCampaignsPerDay: 99999,
    maxBroadcastMessagesPerMonth: 50000,
    maxAutoReplyRules: 99999, 
    leadsVisiblePerSearch: 50,
    leadsExtractedPerDay: 1000,
  },
  [PlanTier.AGENCY]: {
    maxWhatsAppAccounts: 20,
    maxAgents: 99999, // practically unlimited
    maxContacts: 100000,
    storageLimitBytes: BigInt(10 * 1024 * 1024 * 1024), // 10GB
    maxMediaFiles: 99999,
    maxTemplates: 99999,
    maxCampaignsPerDay: 99999,
    maxBroadcastMessagesPerMonth: 500000,
    maxAutoReplyRules: 99999,
    leadsVisiblePerSearch: 120, // All possible leads from Google
    leadsExtractedPerDay: 5000,
  },
};
