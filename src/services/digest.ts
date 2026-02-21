import { prisma } from '../db/client.js';
import { sendText } from './whatsapp.js';
import { config } from '../config.js';

async function generateDigestMessage(): Promise<string> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const [
    newJobsToday,
    pendingJobs,
    confirmedJobs,
    activeConversations,
    openHandoffs,
    urgentPending,
  ] = await Promise.all([
    prisma.job.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.job.count({ where: { status: 'PENDING' } }),
    prisma.job.count({ where: { status: 'CONFIRMED' } }),
    prisma.conversation.count({ where: { state: { notIn: ['DONE', 'HANDOFF'] } } }),
    prisma.conversation.count({ where: { handedOff: true, state: 'HANDOFF' } }),
    prisma.job.count({ where: { status: 'PENDING', urgent: true } }),
  ]);

  const date = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  let message = `☀️ *Good morning! Daily Summary — ${date}*\n\n`;

  message += `📋 *Jobs Overview*\n`;
  message += `• New jobs today: *${newJobsToday}*\n`;
  message += `• Pending (unconfirmed): *${pendingJobs}*`;
  if (urgentPending > 0) message += ` (🚨 ${urgentPending} urgent)`;
  message += `\n`;
  message += `• Confirmed (in progress): *${confirmedJobs}*\n`;

  message += `\n💬 *Conversations*\n`;
  message += `• Active bot chats: *${activeConversations}*\n`;
  message += `• Waiting for your reply: *${openHandoffs}*`;

  if (openHandoffs > 0) {
    message += `\n\n⚠️ You have *${openHandoffs}* customer(s) waiting for a human reply.`;
  }

  if (pendingJobs === 0 && activeConversations === 0) {
    message += `\n\n✅ All caught up — no pending actions!`;
  }

  message += `\n\n_Reply "menu" to any customer to restart their conversation._`;

  return message;
}

export async function sendDailyDigest(): Promise<void> {
  console.log('[digest] Sending daily digest...');
  const message = await generateDigestMessage();
  await sendText(config.ownerPhone, message);
  console.log('[digest] Daily digest sent.');
}
