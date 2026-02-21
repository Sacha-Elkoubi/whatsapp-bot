import axios from 'axios';
import { config } from '../config.js';

const BASE_URL = `https://graph.facebook.com/v21.0/${config.whatsapp.phoneNumberId}/messages`;

const headers = {
  Authorization: `Bearer ${config.whatsapp.token}`,
  'Content-Type': 'application/json',
};

/** Send a plain text message */
export async function sendText(to: string, body: string): Promise<void> {
  await axios.post(
    BASE_URL,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    },
    { headers }
  );
}

export interface ButtonOption {
  id: string;
  title: string; // max 20 chars
}

/** Send an interactive button message (max 3 buttons) */
export async function sendButtons(
  to: string,
  bodyText: string,
  buttons: ButtonOption[]
): Promise<void> {
  await axios.post(
    BASE_URL,
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
    { headers }
  );
}

export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

/** Send an interactive list message (for menus with more than 3 options) */
export async function sendList(
  to: string,
  bodyText: string,
  buttonLabel: string,
  rows: ListRow[]
): Promise<void> {
  await axios.post(
    BASE_URL,
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
    { headers }
  );
}

/** Mark a message as read */
export async function markRead(messageId: string): Promise<void> {
  await axios.post(
    BASE_URL,
    {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    },
    { headers }
  );
}
