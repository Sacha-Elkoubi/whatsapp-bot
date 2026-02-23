import { prisma } from '../db/client.js';
import { sendText } from '../services/whatsapp.js';
import {
  sendWelcomeMenu,
  sendServiceMenu,
  sendIntakeQuestion,
  sendJobConfirmation,
  sendSlotPicker,
  sendFAQMenu,
  getServices,
} from './menus.js';
import { getAvailableSlots, createCalendarEvent } from '../services/calendar.js';
import { handleAiChat, generateQuote } from './ai.js';
import { initiateHandoff } from './handoff.js';
import { matchFAQ, FAQS } from '../services/faq.js';
import { getTenantById, type TenantConfig } from '../services/tenant.js';

interface IncomingMessage {
  phone: string;
  text: string;
  messageId: string;
  tenantId: string;
}

interface IntakeData {
  serviceId?: string;
  serviceType?: string;
  description?: string;
  address?: string;
  urgent?: boolean;
  intakeStep?: number;
  jobId?: string;
  availableSlots?: string[];
}

export async function routeMessage(msg: IncomingMessage): Promise<void> {
  const { phone, text, tenantId } = msg;

  const tenant = await getTenantById(tenantId);
  if (!tenant) {
    console.error(`[router] Tenant not found: ${tenantId}`);
    return;
  }

  // Get or create customer (scoped to tenant)
  const customer = await prisma.customer.upsert({
    where: { tenantId_phone: { tenantId, phone } },
    create: { tenantId, phone },
    update: {},
  });

  // Get latest active conversation (not DONE or HANDOFF)
  let conversation = await prisma.conversation.findFirst({
    where: {
      tenantId,
      customerId: customer.id,
      state: { notIn: ['DONE'] },
    },
    orderBy: { updatedAt: 'desc' },
  });

  // If the conversation is handed off, silently ignore (human is handling it)
  if (conversation?.state === 'HANDOFF') {
    return;
  }

  // If no active conversation, or user says "menu" / "hi" / "start", create new one
  const isGreeting = /^(hi|hello|hey|start|menu|hola|bonjour)$/i.test(text);
  if (!conversation || isGreeting) {
    if (conversation) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { state: 'DONE' },
      });
    }
    conversation = await prisma.conversation.create({
      data: { tenantId, customerId: customer.id, state: 'MENU' },
    });
    await sendWelcomeMenu(tenant, phone);
    return;
  }

  const state = conversation.state;
  const intake: IntakeData = JSON.parse(conversation.intakeData);

  // ─── MENU STATE ────────────────────────────────────────────────────────────
  if (state === 'MENU') {
    if (text === 'menu_request' || text === 'menu_quote') {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { state: 'SERVICE_SELECT' },
      });
      await sendServiceMenu(tenant, phone);
      return;
    }

    if (text === 'menu_faq') {
      await sendFAQMenu(tenant, phone);
      return;
    }

    // FAQ topic selected from FAQ menu
    if (text.startsWith('faq_')) {
      const topicMap: Record<string, string[]> = {
        faq_hours:     ['weekend', 'open'],
        faq_price:     ['cost', 'price'],
        faq_urgent:    ['urgent', 'emergency'],
        faq_area:      ['area', 'cover'],
        faq_payment:   ['payment', 'pay'],
        faq_guarantee: ['guarantee', 'insured'],
      };
      const keywords = topicMap[text];
      const faq = keywords
        ? FAQS.find((f) => f.keywords.some((k) => keywords.includes(k)))
        : null;
      if (faq) {
        await sendText(tenant, phone, faq.answer + '\n\n_Type anything to continue or say "menu" to go back._');
      } else {
        await sendWelcomeMenu(tenant, phone);
      }
      return;
    }

    if (text === 'menu_human') {
      await initiateHandoff(tenant, conversation.id, phone, 'Customer requested human agent');
      return;
    }

    // Unrecognised input — show menu again
    await sendWelcomeMenu(tenant, phone);
    return;
  }

  // ─── SERVICE SELECTION ─────────────────────────────────────────────────────
  if (state === 'SERVICE_SELECT') {
    const services = getServices(tenant);
    const service = services.find((s) => s.id === text);
    if (!service) {
      await sendServiceMenu(tenant, phone);
      return;
    }

    const updatedIntake: IntakeData = { serviceId: service.id, serviceType: service.title, intakeStep: 0 };
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { state: 'INTAKE', intakeData: JSON.stringify(updatedIntake) },
    });
    await sendIntakeQuestion(tenant, phone, 0, service.title);
    return;
  }

  // ─── STRUCTURED INTAKE ─────────────────────────────────────────────────────
  if (state === 'INTAKE') {
    const step = intake.intakeStep ?? 0;

    if (step === 0) {
      const updatedIntake: IntakeData = { ...intake, description: text, intakeStep: 1 };
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { intakeData: JSON.stringify(updatedIntake) },
      });
      await sendIntakeQuestion(tenant, phone, 1, intake.serviceType ?? '');
      return;
    }

    if (step === 1) {
      const updatedIntake: IntakeData = { ...intake, address: text, intakeStep: 2 };
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { intakeData: JSON.stringify(updatedIntake) },
      });
      await sendIntakeQuestion(tenant, phone, 2, intake.serviceType ?? '');
      return;
    }

    if (step === 2) {
      const urgent = text === 'intake_urgent_yes';
      const finalIntake: IntakeData = { ...intake, urgent, intakeStep: 3 };

      await sendText(tenant, phone, '⏳ Generating your quote...');
      const quote = await generateQuote(
        intake.serviceType ?? '',
        intake.description ?? '',
        urgent
      );

      const job = await prisma.job.create({
        data: {
          tenantId,
          customerId: customer.id,
          serviceType: intake.serviceType ?? '',
          description: intake.description ?? '',
          address: intake.address ?? '',
          urgent,
          quoteMin: quote.min,
          quoteMax: quote.max,
        },
      });

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          state: 'CONFIRM',
          intakeData: JSON.stringify({ ...finalIntake, jobId: job.id }),
        },
      });

      await sendJobConfirmation(tenant, phone, {
        service: intake.serviceType ?? '',
        description: intake.description ?? '',
        address: intake.address ?? '',
        urgent,
        quoteMin: quote.min,
        quoteMax: quote.max,
      });
      return;
    }
  }

  // ─── CONFIRMATION ──────────────────────────────────────────────────────────
  if (state === 'CONFIRM') {
    if (text === 'confirm_yes') {
      if (intake.jobId) {
        await prisma.job.update({
          where: { id: intake.jobId },
          data: { status: 'CONFIRMED' },
        });
      }

      await sendText(tenant, phone, '📅 Checking available appointment slots...');
      let slots: Date[] = [];
      try {
        slots = await getAvailableSlots(tenant, intake.serviceType ?? '', intake.urgent ?? false);
      } catch (err) {
        console.error('[calendar] Failed to fetch slots:', err);
      }

      if (slots.length === 0) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { state: 'AI_CHAT' },
        });
        await sendText(
          tenant,
          phone,
          `✅ *Booking confirmed!*\n\nWe couldn't find an automatic slot right now. Our team will contact you shortly to arrange a convenient time. 📞\n\nIs there anything else I can help with?`
        );
        return;
      }

      const updatedIntake: IntakeData = {
        ...intake,
        availableSlots: slots.map((s) => s.toISOString()),
      };
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { state: 'SLOT_SELECT', intakeData: JSON.stringify(updatedIntake) },
      });
      await sendSlotPicker(tenant, phone, slots);
      return;
    }

    if (text === 'confirm_no') {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { state: 'DONE' },
      });
      await sendText(tenant, phone, `No problem! Feel free to message us anytime you need help. 😊`);
      return;
    }
  }

  // ─── SLOT SELECTION ────────────────────────────────────────────────────────
  if (state === 'SLOT_SELECT') {
    const slotMatch = text.match(/^slot_(\d+)$/);
    if (!slotMatch || !intake.availableSlots) {
      const slots = (intake.availableSlots ?? []).map((s) => new Date(s));
      await sendSlotPicker(tenant, phone, slots);
      return;
    }

    const slotIndex = parseInt(slotMatch[1] ?? '0', 10);
    const slotIso = intake.availableSlots[slotIndex];
    if (!slotIso) {
      const slots = intake.availableSlots.map((s) => new Date(s));
      await sendSlotPicker(tenant, phone, slots);
      return;
    }

    const chosenSlot = new Date(slotIso);

    let eventId = '';
    let calendarLink = '';
    try {
      const event = await createCalendarEvent(tenant, {
        serviceType: intake.serviceType ?? '',
        description: intake.description ?? '',
        address: intake.address ?? '',
        customerPhone: phone,
        startTime: chosenSlot,
        urgent: intake.urgent ?? false,
      });
      eventId = event.eventId;
      calendarLink = event.calendarLink;
    } catch (err) {
      console.error('[calendar] Failed to create event:', err);
    }

    if (intake.jobId) {
      await prisma.job.update({
        where: { id: intake.jobId },
        data: {
          scheduledAt: chosenSlot,
          calendarEventId: eventId || null,
          calendarLink: calendarLink || null,
        },
      });
    }

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { state: 'AI_CHAT' },
    });

    const slotLabel = chosenSlot.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    await sendText(
      tenant,
      phone,
      `✅ *Appointment booked!*\n\n📅 ${slotLabel}\n📍 ${intake.address ?? ''}\n\nYour engineer will arrive at the scheduled time. You'll receive a reminder closer to the date.\n\nIs there anything else I can help with?`
    );
    return;
  }

  // ─── AI CHAT STATE ─────────────────────────────────────────────────────────
  if (state === 'AI_CHAT') {
    const faqAnswer = matchFAQ(text);
    if (faqAnswer) {
      await sendText(tenant, phone, faqAnswer);
      return;
    }

    const reply = await handleAiChat(tenant, conversation.id, text);

    if (reply.toLowerCase().includes("i'll connect you with our team")) {
      await sendText(tenant, phone, reply);
      await initiateHandoff(tenant, conversation.id, phone, 'Claude suggested escalation');
      return;
    }

    await sendText(tenant, phone, reply);
    return;
  }

  // ─── FALLBACK ──────────────────────────────────────────────────────────────
  await sendWelcomeMenu(tenant, phone);
}
