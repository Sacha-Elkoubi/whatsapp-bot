import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../db/client.js';
import { sendDailyDigest } from '../services/digest.js';
import { authMiddleware } from './auth.js';

function getTenantId(req: FastifyRequest): string {
  return (req as any).tenantId;
}

export function registerDashboardRoutes(app: FastifyInstance): void {
  // All dashboard routes require auth
  app.addHook('preHandler', authMiddleware);

  /** Stats summary */
  app.get('/api/stats', async (req) => {
    const tenantId = getTenantId(req);

    const [totalJobs, pendingJobs, confirmedJobs, doneJobs, activeConversations, openHandoffs] =
      await Promise.all([
        prisma.job.count({ where: { tenantId } }),
        prisma.job.count({ where: { tenantId, status: 'PENDING' } }),
        prisma.job.count({ where: { tenantId, status: 'CONFIRMED' } }),
        prisma.job.count({ where: { tenantId, status: 'DONE' } }),
        prisma.conversation.count({ where: { tenantId, state: { notIn: ['DONE', 'HANDOFF'] } } }),
        prisma.conversation.count({ where: { tenantId, handedOff: true, state: 'HANDOFF' } }),
      ]);

    return { totalJobs, pendingJobs, confirmedJobs, doneJobs, activeConversations, openHandoffs };
  });

  /** All jobs with customer phone */
  app.get('/api/jobs', async (req) => {
    const tenantId = getTenantId(req);
    return prisma.job.findMany({
      where: { tenantId },
      include: { customer: { select: { phone: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  });

  /** Single job */
  app.get<{ Params: { id: string } }>('/api/jobs/:id', async (req, reply) => {
    const tenantId = getTenantId(req);
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, tenantId },
      include: { customer: { select: { phone: true, name: true } } },
    });
    if (!job) return reply.status(404).send({ error: 'Not found' });
    return job;
  });

  /** Update job status */
  app.patch<{ Params: { id: string }; Body: { status: string } }>(
    '/api/jobs/:id/status',
    async (req, reply) => {
      const tenantId = getTenantId(req);
      const { status } = req.body;
      if (!['PENDING', 'CONFIRMED', 'DONE'].includes(status)) {
        return reply.status(400).send({ error: 'Invalid status' });
      }
      // Verify ownership before updating
      const existing = await prisma.job.findFirst({ where: { id: req.params.id, tenantId } });
      if (!existing) return reply.status(404).send({ error: 'Not found' });

      const job = await prisma.job.update({
        where: { id: req.params.id },
        data: { status },
      });
      return job;
    }
  );

  /** All conversations (most recent first) */
  app.get('/api/conversations', async (req) => {
    const tenantId = getTenantId(req);
    return prisma.conversation.findMany({
      where: { tenantId },
      include: { customer: { select: { phone: true, name: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  });

  /** All customers */
  app.get('/api/customers', async (req) => {
    const tenantId = getTenantId(req);
    return prisma.customer.findMany({
      where: { tenantId },
      include: {
        _count: { select: { jobs: true, conversations: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  /** Manually trigger the daily digest (for testing) */
  app.get('/api/test-digest', async () => {
    await sendDailyDigest();
    return { ok: true, message: 'Digest sent to all tenants' };
  });
}
