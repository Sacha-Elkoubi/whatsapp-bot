import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db/client.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';

interface RegisterBody {
  email: string;
  password: string;
  name: string;
  slug: string;
  whatsappToken: string;
  whatsappPhoneNumberId: string;
  whatsappVerifyToken: string;
  googleServiceAccountEmail: string;
  googlePrivateKey: string;
  googleCalendarId: string;
  ownerPhone: string;
}

interface LoginBody {
  email: string;
  password: string;
}

interface JwtPayload {
  tenantId: string;
  email: string;
}

export function registerAuthRoutes(app: FastifyInstance): void {
  /** Register a new tenant */
  app.post<{ Body: RegisterBody }>('/api/auth/register', async (req, reply) => {
    const { email, password, name, slug, ...credentials } = req.body;

    if (!email || !password || !name || !slug) {
      return reply.status(400).send({ error: 'Missing required fields: email, password, name, slug' });
    }

    const existing = await prisma.tenant.findFirst({
      where: {
        OR: [
          { email },
          { slug },
          ...(credentials.whatsappPhoneNumberId
            ? [{ whatsappPhoneNumberId: credentials.whatsappPhoneNumberId }]
            : []),
        ],
      },
    });

    if (existing) {
      return reply.status(409).send({ error: 'A tenant with this email, slug, or phone number already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const tenant = await prisma.tenant.create({
      data: {
        email,
        passwordHash,
        name,
        slug,
        whatsappToken: credentials.whatsappToken ?? '',
        whatsappPhoneNumberId: credentials.whatsappPhoneNumberId ?? '',
        whatsappVerifyToken: credentials.whatsappVerifyToken ?? '',
        googleServiceAccountEmail: credentials.googleServiceAccountEmail ?? '',
        googlePrivateKey: credentials.googlePrivateKey ?? '',
        googleCalendarId: credentials.googleCalendarId ?? '',
        ownerPhone: credentials.ownerPhone ?? '',
      },
    });

    const token = jwt.sign(
      { tenantId: tenant.id, email: tenant.email } as JwtPayload,
      config.jwt.secret,
      { expiresIn: '7d' }
    );

    return {
      token,
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, email: tenant.email },
    };
  });

  /** Login */
  app.post<{ Body: LoginBody }>('/api/auth/login', async (req, reply) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return reply.status(400).send({ error: 'Missing email or password' });
    }

    const tenant = await prisma.tenant.findUnique({ where: { email } });
    if (!tenant) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, tenant.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { tenantId: tenant.id, email: tenant.email } as JwtPayload,
      config.jwt.secret,
      { expiresIn: '7d' }
    );

    return {
      token,
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, email: tenant.email },
    };
  });
}

/** Auth middleware — extracts tenantId from Bearer token */
export async function authMiddleware(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'Missing authorization token' });
    return;
  }

  try {
    const payload = jwt.verify(authHeader.slice(7), config.jwt.secret) as JwtPayload;
    (req as any).tenantId = payload.tenantId;
  } catch {
    reply.status(401).send({ error: 'Invalid or expired token' });
  }
}
