import { z } from "zod";

export const TRADES = ["landscaping","residential_repair","cleaning","multifamily","commercial_construction","government_procurement","other"] as const;
export const ZIP = z.string().regex(/^\d{5}$/);

/** Classification JSON contract (spec §5). Nullable = only when stated in source. */
export const Classification = z.object({
  trade: z.enum(TRADES),
  subtrades: z.array(z.string().max(60)).max(20),
  property_type: z.enum(["residential","multifamily","commercial","government","unknown"]),
  city: z.string().max(80).nullable(),
  state: z.string().length(2).nullable(),
  zip: ZIP.nullable(),
  is_recurring: z.boolean().nullable(),
  budget_min: z.number().nonnegative().nullable(),
  budget_max: z.number().nonnegative().nullable(),
  deadline: z.string().nullable().describe("ISO 8601 date only if explicitly stated"),
  source_kind: z.enum(["official_api","partner","direct","community_referral"]),
  verification_status: z.enum(["unverified","pending","verified"]),
  consent_status: z.enum(["not_granted","granted","unknown"]),
  missing_fields: z.array(z.string().max(40)).max(20),
  summary: z.string().max(400),
  needs_review: z.boolean(),
  review_reason: z.string().max(300).nullable(),
  suspected_prompt_injection: z.boolean(),
});
export type Classification = z.infer<typeof Classification>;

export const IntakeForm = z.object({
  submission_id: z.string().min(8).max(100),
  "cf-turnstile-response": z.string().min(1),
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  phone: z.string().regex(/^[0-9+().\-\s]{7,20}$/).optional().or(z.literal("")),
  zip: ZIP,
  city: z.string().max(80).optional(),
  address: z.string().max(300).optional(),
  description: z.string().min(10).max(4000),
  timeline: z.string().max(200).optional(),
  property_type: z.string().max(40).optional(),
  consent_share: z.literal("true", { errorMap: () => ({ message: "Lead-sharing consent is required" }) }),
  consent_privacy: z.literal("true", { errorMap: () => ({ message: "Privacy acknowledgement is required" }) }),
  website: z.string().max(0).optional(), // honeypot
  // v2 (all optional so the old embed keeps working)
  urgency: z.enum(["urgent", "normal", "recurring"]).optional(),
  submitter_kind: z.enum(["homeowner", "property_manager"]).optional(),
  organization_name: z.string().max(160).optional(),
  consent_public_listing: z.enum(["true", "false"]).optional(), // separate, optional: non-identifying public summary
});
export const ManageAction = z.object({ token: z.string().min(32).max(128), action: z.enum(["status", "withdraw", "close", "reconfirm", "unlist"]), reason: z.string().max(300).optional() });

/** Contractor signup / onboarding (v3). Free tier = public bids only; paid plans unlock private leads. */
export const ContractorOnboard = z.object({
  business_name: z.string().trim().min(2).max(160),
  display_name: z.string().trim().min(1).max(120),
  trades: z.array(z.enum(TRADES)).min(1).max(7),
  zip_codes: z.array(z.string().regex(/^\d{5}$/)).max(50).default([]),
  service_radius: z.number().int().min(0).max(250).optional(),
  statewide: z.boolean().default(false),
  goal: z.enum(["now", "future", "buyers", "all"]).default("now"),
  min_job_value: z.number().min(0).max(10_000_000).optional(),
  website: z.string().url().max(300).optional().or(z.literal("")),
  alert_email: z.string().email().max(200).optional(),
  max_alerts_daily: z.number().int().min(0).max(50).default(10),
  accept_terms: z.literal(true),
}).refine(v => v.statewide || v.zip_codes.length > 0, { message: "Add at least one service ZIP or choose statewide", path: ["zip_codes"] });
