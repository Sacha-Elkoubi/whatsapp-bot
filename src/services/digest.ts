import { prisma } from '../db/client.js';
import { sendText } from './whatsapp.js';
import { getAllActiveTenants, type TenantConfig } from './tenant.js';

async function generateDigestMessage(tenantId: string): Promise<string> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    newJobsToday,
    pendingJobs,
    confirmedJobs,
    activeConversations,
    openHandoffs,
    urgentPending,
  ] = await Promise.all([
    prisma.job.count({ where: { tenantId, createdAt: { gte: todayStart } } }),
    prisma.job.count({ where: { tenantId, status: 'PENDING' } }),
    prisma.job.count({ where: { tenantId, status: 'CONFIRMED' } }),
    prisma.conversation.count({ where: { tenantId, state: { notIn: ['DONE', 'HANDOFF'] } } }),
    prisma.conversation.count({ where: { tenantId, handedOff: true, state: 'HANDOFF' } }),
    prisma.job.count({ where: { tenantId, status: 'PENDING', urgent: true } }),
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
  console.log('[digest] Sending daily digest to all tenants...');
  const tenants = await getAllActiveTenants();

  for (const tenant of tenants) {
    try {
      const message = await generateDigestMessage(tenant.id);
      await sendText(tenant, tenant.ownerPhone, message);
      console.log(`[digest] Digest sent to tenant: ${tenant.slug}`);
    } catch (err) {
      console.error(`[digest] Failed for tenant ${tenant.slug}:`, err);
    }
  }

  console.log('[digest] All digests sent.');
}
