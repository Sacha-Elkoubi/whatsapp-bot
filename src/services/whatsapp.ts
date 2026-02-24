import axios from 'axios';
import type { TenantConfig } from './tenant.js';

function makeUrl(phoneNumberId: string): string {
  return `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
}

function makeHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/** Send a plain text message */
export async function sendText(tenant: TenantConfig, to: string, body: string): Promise<void> {
  await axios.post(
    makeUrl(tenant.whatsappPhoneNumberId),
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    },
    { headers: makeHeaders(tenant.whatsappToken) }
  );
}

export interface ButtonOption {
  id: string;
  title: string; // max 20 chars
}

/** Send an interactive button message (max 3 buttons) */
export async function sendButtons(
  tenant: TenantConfig,
  to: string,
  bodyText: string,
  buttons: ButtonOption[]
): Promise<void> {
  await axios.post(
    makeUrl(tenant.whatsappPhoneNumberId),
    {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: buttons.map((b) => ({
            type: 'reply',
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    },
    { headers: makeHeaders(tenant.whatsappToken) }
  );
}

export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

/** Send an interactive list message (for menus with more than 3 options) */
export async function sendList(
  tenant: TenantConfig,
  to: string,
  bodyText: string,
  buttonLabel: string,
  rows: ListRow[]
): Promise<void> {
  await axios.post(
    makeUrl(tenant.whatsappPhoneNumberId),
    {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: bodyText },
        action: {
          button: buttonLabel,
          sections: [{ title: 'Options', rows }],
        },
      },
    },
    { headers: makeHeaders(tenant.whatsappToken) }
  );
}

/** Mark a message as read */
export async function markRead(tenant: TenantConfig, messageId: string): Promise<void> {
  await axios.post(
    makeUrl(tenant.whatsappPhoneNumberId),
    {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    },
    { headers: makeHeaders(tenant.whatsappToken) }
  );
}
