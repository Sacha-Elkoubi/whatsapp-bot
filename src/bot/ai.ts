import { chat, type Message } from '../services/anthropic.js';
import { prisma } from '../db/client.js';
import type { TenantConfig } from '../services/tenant.js';

function buildSystemPrompt(tenant: TenantConfig): string {
  return `You are a helpful assistant for ${tenant.name}, a local service business that provides plumbing, locksmith, electrical, and handyman services.

Your job is to:
1. Answer customer questions about services, pricing, and availability in a friendly, concise way
2. When asked for a quote, estimate a realistic price range based on the service type and description
3. Keep replies short and conversational (2-4 sentences max)
4. Always be warm, professional, and reassuring

Pricing guidelines (in GBP):
- Plumber call-out: £80–£120. Simple fix: +£50–£100. Complex: +£150–£400
- Locksmith: £60–£100 call-out. Lock change: +£50–£150. Emergency entry: +£80–£200
- Electrician: £60–£100 call-out. Socket/switch: +£40–£80. Full rewire: £2000+
- Handyman: £40–£60/hr, minimum 1 hour

Always give a price range, not a fixed price. End quote estimates with "This is an estimate — the engineer will confirm on-site."

If a customer is angry or the problem sounds complex, suggest speaking to a human: "I'll connect you with our team who can give you more accurate help."`;
}

export async function handleAiChat(
  tenant: TenantConfig,
  conversationId: string,
  userMessage: string,
): Promise<string> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) throw new Error(`Conversation ${conversationId} not found`);

  const history: Message[] = JSON.parse(conversation.aiHistory) as Message[];
  history.push({ role: 'user', content: userMessage });

  const reply = await chat(buildSystemPrompt(tenant), history);
  history.push({ role: 'assistant', content: reply });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { aiHistory: JSON.stringify(history) },
  });

  return reply;
}

/** Generate a quote estimate given job details */
export async function generateQuote(
  service: string,
  description: string,
  urgent: boolean
): Promise<{ min: number; max: number }> {
  const systemPrompt = `You are a pricing assistant for a service business. Reply with ONLY valid JSON.`;

  const prompt = `Give me a JSON quote estimate for this job.
Service: ${service}
Description: ${description}
Urgent: ${urgent}

Reply with ONLY valid JSON in this exact format: {"min": 80, "max": 150}
No explanation, just the JSON.`;

  const result = await chat(systemPrompt, [{ role: 'user', content: prompt }]);

  try {
    const parsed = JSON.parse(result.trim()) as { min: number; max: number };
    return { min: parsed.min, max: parsed.max };
  } catch {
    return { min: 80, max: 200 };
  }
}
