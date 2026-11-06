import { z } from 'zod';

export const MAX_BRIEFING_LENGTH = 8000;
export const MAX_PRIORITIES = 12;
export const MAX_PRIORITY_LENGTH = 300;
export const MAX_MESSAGES = 30;
export const MAX_MESSAGE_LENGTH = 4000;

export const prioritySchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().trim().min(1).max(MAX_PRIORITY_LENGTH),
});
export type Priority = z.infer<typeof prioritySchema>;

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

const runIdSchema = z.string().min(8).max(64);
const briefingSchema = z.string().trim().min(1).max(MAX_BRIEFING_LENGTH);

export const generateRequestSchema = z.object({
  runId: runIdSchema,
  briefing: briefingSchema,
  priorities: z.array(prioritySchema).min(1).max(MAX_PRIORITIES),
  messages: z
    .array(chatMessageSchema)
    .min(1)
    .max(MAX_MESSAGES)
    .refine((messages) => messages[messages.length - 1]?.role === 'user', {
      message: 'The last message must be from the user.',
    }),
});
export type GenerateRequest = z.infer<typeof generateRequestSchema>;

export const errorBodySchema = z.object({
  code: z.string(),
  message: z.string(),
});
export type ErrorBody = z.infer<typeof errorBodySchema>;

const eventEnvelope = {
  runId: z.string(),
  seq: z.number().int().positive(),
};

export const runEventSchema = z.discriminatedUnion('type', [
  z.object({
    ...eventEnvelope,
    type: z.literal('response.delta'),
    payload: z.object({ text: z.string() }),
  }),
  z.object({
    ...eventEnvelope,
    type: z.literal('run.completed'),
    payload: z.object({}),
  }),
  z.object({
    ...eventEnvelope,
    type: z.literal('run.failed'),
    payload: z.object({
      code: z.string(),
      message: z.string(),
      retryable: z.boolean(),
    }),
  }),
]);
export type RunEvent = z.infer<typeof runEventSchema>;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type RunEventBody = DistributiveOmit<RunEvent, 'runId' | 'seq'>;
