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
});
