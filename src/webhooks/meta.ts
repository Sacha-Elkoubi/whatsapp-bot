import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';
import { routeMessage } from '../bot/router.js';
import { markRead } from '../services/whatsapp.js';

interface VerifyQuery {
  'hub.mode': string;
  'hub.verify_token': string;
  'hub.challenge': string;
}

// Shape of a WhatsApp Cloud API webhook payload (simplified)
interface WebhookBody {
  object: string;
  entry: Array<{
    changes: Array<{
      value: {
        messages?: Array<{
          id: string;
          from: string;
          type: string;
          text?: { body: string };
          interactive?: {
            type: string;
            button_reply?: { id: string; title: string };
            list_reply?: { id: string; title: string };
          };
        }>;
      };
    }>;
  }>;
}

export function registerWebhooks(app: FastifyInstance): void {
  /** Webhook verification (GET) — Meta sends this when you save the webhook URL */
  app.get('/webhook', (req: FastifyRequest<{ Querystring: VerifyQuery }>, reply: FastifyReply) => {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;

    if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
      console.log('Webhook verified');
      reply.send(challenge);
    } else {
      reply.status(403).send('Forbidden');
    }
  });

  /** Receive messages (POST) */
  app.post('/webhook', async (req: FastifyRequest<{ Body: WebhookBody }>, reply: FastifyReply) => {
    reply.status(200).send('OK'); // Always ACK quickly

    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const message of change.value.messages ?? []) {
          // Mark as read
          markRead(message.id).catch(() => {});

          // Extract text or button reply
          let text = '';
          if (message.type === 'text' && message.text) {
            text = message.text.body.trim();
          } else if (message.type === 'interactive' && message.interactive) {
            const ir = message.interactive;
            text = ir.button_reply?.id ?? ir.list_reply?.id ?? '';
          }

          if (!text) continue;

          // Route message to bot logic (async, non-blocking)
          routeMessage({ phone: message.from, text, messageId: message.id }).catch((err) => {
            console.error('routeMessage error:', err);
          });
        }
      }
    }
  });
}
