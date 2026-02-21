import { prisma } from '../db/client.js';
import { sendText } from '../services/whatsapp.js';
import { config } from '../config.js';

export async function initiateHandoff(
  conversationId: string,
  customerPhone: string,
  reason?: string
): Promise<void> {
  // Mark conversation as handed off
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { state: 'HANDOFF', handedOff: true },
  });

  // Notify the customer
  await sendText(
    customerPhone,
    `I'm connecting you with a member of our team now. 👤\n\nThey'll reply to you shortly. Thank you for your patience!`
  );

  // Notify the business owner via WhatsApp
  const customer = await prisma.customer.findUnique({
    where: { phone: customerPhone },
  });

  const customerName = customer?.name ?? customerPhone;
  const reasonText = reason ? `\nReason: ${reason}` : '';

  await sendText(
    config.ownerPhone,
    `🔔 *Handoff Alert*\n\nA customer needs your attention.\n\nCustomer: ${customerName}\nPhone: ${customerPhone}${reasonText}\n\nReply directly to this number on WhatsApp to respond.`
  );
}
