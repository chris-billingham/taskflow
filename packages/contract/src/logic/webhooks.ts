// What a webhook can be sent for. Kept free of zod (like the other logic/
// modules) so the web app can import it without pulling zod into its first
// load, which also reshuffled the production chunks into an import cycle.
export const WEBHOOK_EVENTS = [
  'task.created',
  'task.updated',
  'task.completed',
  'task.uncompleted',
  'task.deleted',
  'comment.created',
  'comment.deleted',
] as const;

export type WebhookEventName = (typeof WEBHOOK_EVENTS)[number];
