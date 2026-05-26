import { z } from "zod";

export const AgentConfigSchema = z.object({
  slug: z.string().min(1),
  channel: z.enum(["telegram"]),
  wakeOn: z.array(z.enum(["email", "calendar"])).default(["email"]),
  createdAt: z.string(),
  lastWake: z.string().nullable().default(null),
  telegramChatId: z.string().optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;
