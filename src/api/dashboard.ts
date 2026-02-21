import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/client.js';
import { sendDailyDigest } from '../services/digest.js';

export function registerDashboardRoutes(app: FastifyInstance): void {
  /** Stats summary */
  app.get('/api/stats', async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [totalJobs, pendingJobs, confirmedJobs, doneJobs, activeConversations, openHandoffs] =
      await Promise.all([
        prisma.job.count(),
        prisma.job.count({ where: { status: 'PENDING' } }),
        prisma.job.count({ where: { status: 'CONFIRMED' } }),
        prisma.job.count({ where: { status: 'DONE' } }),
        prisma.conversation.count({ where: { state: { notIn: ['DONE', 'HANDOFF'] } } }),
        prisma.conversation.count({ where: { handedOff: true, state: 'HANDOFF' } }),
      ]);

    return { totalJobs, pendingJobs, confirmedJobs, doneJobs, activeConversations, openHandoffs };
  });

  /** All jobs with customer phone */
  app.get('/api/jobs', async () => {
    return prisma.job.findMany({
      include: { customer: { select: { phone: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  });

  /** Single job */
  app.get<{ Params: { id: string } }>('/api/jobs/:id', async (req, reply) => {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      include: { customer: { select: { phone: true, name: true } } },
    });
    if (!job) return reply.status(404).send({ error: 'Not found' });
    return job;
  });

  /** Update job status */
  app.patch<{ Params: { id: string }; Body: { status: string } }>(
    '/api/jobs/:id/status',
    async (req, reply) => {
      const { status } = req.body;
      if (!['PENDING', 'CONFIRMED', 'DONE'].includes(status)) {
        return reply.status(400).send({ error: 'Invalid status' });
      }
      const job = await prisma.job.update({
        where: { id: req.params.id },
        data: { status },
      });
      return job;
    }
  );

  /** All conversations (non-DONE, most recent first) */
  app.get('/api/conversations', async () => {
    return prisma.conversation.findMany({
      include: { customer: { select: { phone: true, name: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  });

  /** All customers */
  app.get('/api/customers', async () => {
    return prisma.customer.findMany({
      include: {
        _count: { select: { jobs: true, conversations: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  /** Manually trigger the daily digest (for testing) */
  app.get('/api/test-digest', async () => {
    await sendDailyDigest();
    return { ok: true, message: 'Digest sent to owner WhatsApp' };
  });
}
