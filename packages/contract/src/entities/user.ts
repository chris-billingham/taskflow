import { z } from 'zod';
import { id, type Wire } from '../common.js';

/** Who someone is, as shown next to their work (assignee, author, member). */
export const userSummarySchema = z.object({
  id,
  name: z.string(),
  email: z.string(),
  avatarUrl: z.string().nullable(),
});
export type UserSummary = Wire<typeof userSummarySchema>;

/**
 * A project member. Email is null for workspace-project members: teammates
 * see names, not addresses.
 */
export const memberSummarySchema = userSummarySchema.extend({
  email: z.string().nullable(),
});
export type MemberSummary = Wire<typeof memberSummarySchema>;
