import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';
import { routeMessage } from '../bot/router.js';
import { markRead } from '../services/whatsapp.js';
import { getTenantByPhoneNumberId } from '../services/tenant.js';

interface VerifyQuery {
  'hub.mode': string;
  'hub.verify_token': string;
  'hub.challenge': string;
}

interface WebhookBody {
  object: string;
  entry: Array<{
    changes: Array<{
      value: {
        metadata?: {
          phone_number_id: string;
          display_phone_number: string;
        };
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
  /** Webhook verification (GET) — shared verify token across all tenants */
  app.get('/webhook', (req: FastifyRequest<{ Querystring: VerifyQuery }>, reply: FastifyReply) => {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;

    if (mode === 'subscribe' && token === config.webhook.verifyToken) {
      console.log('Webhook verified');
      reply.send(challenge);
    } else {
      reply.status(403).send('Forbidden');
    }
  });

  /** Receive messages (POST) — resolve tenant from phoneNumberId */
  app.post('/webhook', async (req: FastifyRequest<{ Body: WebhookBody }>, reply: FastifyReply) => {
    reply.status(200).send('OK');

    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const phoneNumberId = change.value.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        // Resolve tenant from the WhatsApp phone number ID
        const tenant = await getTenantByPhoneNumberId(phoneNumberId);
        if (!tenant) {
          console.warn(`[webhook] No tenant found for phoneNumberId: ${phoneNumberId}`);
          continue;
        }

        for (const message of change.value.messages ?? []) {
          markRead(tenant, message.id).catch(() => {});

          let text = '';
          if (message.type === 'text' && message.text) {
            text = message.text.body.trim();
          } else if (message.type === 'interactive' && message.interactive) {
            const ir = message.interactive;
            text = ir.button_reply?.id ?? ir.list_reply?.id ?? '';
          }

          if (!text) continue;

          routeMessage({
            phone: message.from,
            text,
            messageId: message.id,
            tenantId: tenant.id,
          }).catch((err) => {
            console.error('routeMessage error:', err);
          });
        }
      }
    }
  });
}
