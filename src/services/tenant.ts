import { prisma } from '../db/client.js';
import type { Tenant } from '@prisma/client';

export type TenantConfig = Tenant;

// In-memory cache: Map<tenantId, { tenant, expiresAt }>
const cacheById = new Map<string, { tenant: TenantConfig; expiresAt: number }>();
// Secondary index: Map<phoneNumberId, tenantId>
const phoneNumberIdIndex = new Map<string, string>();

const TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getTenantById(tenantId: string): Promise<TenantConfig | null> {
  const cached = cacheById.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.tenant;
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (tenant) {
    cacheById.set(tenantId, { tenant, expiresAt: Date.now() + TTL_MS });
    phoneNumberIdIndex.set(tenant.whatsappPhoneNumberId, tenant.id);
  }
  return tenant;
}

export async function getTenantByPhoneNumberId(phoneNumberId: string): Promise<TenantConfig | null> {
  const cachedId = phoneNumberIdIndex.get(phoneNumberId);
  if (cachedId) {
    const result = await getTenantById(cachedId);
    if (result) return result;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { whatsappPhoneNumberId: phoneNumberId },
  });
  if (tenant) {
    cacheById.set(tenant.id, { tenant, expiresAt: Date.now() + TTL_MS });
    phoneNumberIdIndex.set(phoneNumberId, tenant.id);
  }
  return tenant;
}

export function invalidateTenantCache(tenantId: string): void {
  const cached = cacheById.get(tenantId);
  if (cached) {
    phoneNumberIdIndex.delete(cached.tenant.whatsappPhoneNumberId);
  }
  cacheById.delete(tenantId);
}

export async function getAllActiveTenants(): Promise<TenantConfig[]> {
  return prisma.tenant.findMany({ where: { active: true } });
}
