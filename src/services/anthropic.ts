import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/** Send a conversation to Claude and get a reply */
export async function chat(
  systemPrompt: string,
  history: Message[]
): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: history,
  });

  const block = response.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('Unexpected response from Claude');
  }
  return block.text;
}
