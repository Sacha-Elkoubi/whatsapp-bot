import { google } from 'googleapis';
import type { TenantConfig } from './tenant.js';

// Slot duration in minutes per service type
const SLOT_DURATION_MINUTES: Record<string, number> = {
  Plumber: 120,
  Electrician: 120,
  Locksmith: 60,
  Handyman: 60,
};

// Shorter slots for urgent requests — easier to fit into calendar gaps
const URGENT_SLOT_DURATION_MINUTES: Record<string, number> = {
  Plumber: 60,
  Electrician: 60,
  Locksmith: 30,
  Handyman: 30,
};

const DEFAULT_DURATION = 120;
const DEFAULT_URGENT_DURATION = 60;

// Default business hours
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 18;
const DEFAULT_DAYS = [1, 2, 3, 4, 5]; // Mon–Fri

interface BusinessHours {
  start: number;
  end: number;
  days: number[];
}

function getBusinessHours(tenant: TenantConfig): BusinessHours {
  if (tenant.businessHours) {
    try {
      const parsed = JSON.parse(tenant.businessHours) as BusinessHours;
      return {
        start: parsed.start ?? DEFAULT_START_HOUR,
        end: parsed.end ?? DEFAULT_END_HOUR,
        days: parsed.days ?? DEFAULT_DAYS,
      };
    } catch {
      // fall through to default
    }
  }
  return { start: DEFAULT_START_HOUR, end: DEFAULT_END_HOUR, days: DEFAULT_DAYS };
}

function getSlotDuration(serviceType: string, urgent: boolean): number {
  if (urgent) {
    return URGENT_SLOT_DURATION_MINUTES[serviceType] ?? DEFAULT_URGENT_DURATION;
  }
  return SLOT_DURATION_MINUTES[serviceType] ?? DEFAULT_DURATION;
}

function getCalendarClient(tenant: TenantConfig) {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: tenant.googleServiceAccountEmail,
      private_key: tenant.googlePrivateKey.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  return google.calendar({ version: 'v3', auth });
}

/** Round up to next slot boundary (on the hour or half-hour) */
function roundUpToSlot(date: Date, durationMin: number): Date {
  const d = new Date(date);
  const step = durationMin >= 60 ? 60 : 30;
  const minutes = d.getMinutes();
  const remainder = minutes % step;
  if (remainder !== 0) {
    d.setMinutes(minutes + (step - remainder), 0, 0);
  } else {
    d.setSeconds(0, 0);
  }
  return d;
}

/** Get the start of the next valid business window */
function nextBusinessStart(from: Date, hours: BusinessHours): Date {
  const d = new Date(from);
  const day = d.getDay();

  // If not a business day, advance to the next one
  if (!hours.days.includes(day)) {
    for (let i = 1; i <= 7; i++) {
      const nextDay = (day + i) % 7;
      if (hours.days.includes(nextDay)) {
        d.setDate(d.getDate() + i);
        d.setHours(hours.start, 0, 0, 0);
        return d;
      }
    }
  }

  // If after business hours, move to next business day
  if (d.getHours() >= hours.end) {
    d.setDate(d.getDate() + 1);
    d.setHours(hours.start, 0, 0, 0);
    return nextBusinessStart(d, hours);
  }

  // If before business hours, set to start
  if (d.getHours() < hours.start) {
    d.setHours(hours.start, 0, 0, 0);
  }

  return d;
}

function isBusinessHour(date: Date, hours: BusinessHours): boolean {
  if (!hours.days.includes(date.getDay())) return false;
  const hour = date.getHours();
  return hour >= hours.start && hour < hours.end;
}

/**
 * Returns up to 3 available start times from Google Calendar.
 * For urgent requests, uses shorter slot durations, a smaller buffer,
 * and a tighter search window to prioritise the soonest availability.
 */
export async function getAvailableSlots(tenant: TenantConfig, serviceType: string, urgent = false): Promise<Date[]> {
  const durationMin = getSlotDuration(serviceType, urgent);
  const calendar = getCalendarClient(tenant);
  const hours = getBusinessHours(tenant);

  const now = new Date();
  // Shorter buffer for urgent requests (15 min vs 30 min)
  now.setMinutes(now.getMinutes() + (urgent ? 15 : 30));

  const searchStart = nextBusinessStart(now, hours);
  const searchEnd = new Date(searchStart);
  // Urgent: search 3 days ahead; normal: 7 days
  searchEnd.setDate(searchEnd.getDate() + (urgent ? 3 : 7));

  // Get busy blocks from Google Calendar
  const freebusyRes = await calendar.freebusy.query({
    requestBody: {
      timeMin: searchStart.toISOString(),
      timeMax: searchEnd.toISOString(),
      items: [{ id: tenant.googleCalendarId }],
    },
  });

  const busyBlocks =
    freebusyRes.data.calendars?.[tenant.googleCalendarId]?.busy ?? [];

  const busy = busyBlocks.map((b) => ({
    start: new Date(b.start ?? ''),
    end: new Date(b.end ?? ''),
  }));

  // Walk through time in slot-sized steps, collect free slots
  const slots: Date[] = [];
  let cursor = roundUpToSlot(searchStart, durationMin);

  while (slots.length < 3 && cursor < searchEnd) {
    const slotEnd = new Date(cursor.getTime() + durationMin * 60 * 1000);

    // Slot must fit within business hours
    if (
      isBusinessHour(cursor, hours) &&
      slotEnd.getHours() <= hours.end &&
      !(slotEnd.getHours() === hours.end && slotEnd.getMinutes() > 0)
    ) {
      // Check not overlapping any busy block
      const overlaps = busy.some(
        (b) => cursor < b.end && slotEnd > b.start
      );

      if (!overlaps) {
        slots.push(new Date(cursor));
      }
    }

    // Advance cursor
    cursor = new Date(cursor.getTime() + durationMin * 60 * 1000);

    // If we've gone past business end, jump to next business day
    if (cursor.getHours() >= hours.end) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(hours.start, 0, 0, 0);
      cursor = nextBusinessStart(cursor, hours);
    }
  }

  return slots;
}

export interface CalendarEvent {
  eventId: string;
  calendarLink: string;
}

/**
 * Creates a Google Calendar event for the job appointment.
 */
export async function createCalendarEvent(tenant: TenantConfig, opts: {
  serviceType: string;
  description: string;
  address: string;
  customerPhone: string;
  startTime: Date;
  urgent?: boolean;
}): Promise<CalendarEvent> {
  const durationMin = getSlotDuration(opts.serviceType, opts.urgent ?? false);
  const endTime = new Date(opts.startTime.getTime() + durationMin * 60 * 1000);
  const calendar = getCalendarClient(tenant);

  const urgentPrefix = opts.urgent ? '[URGENT] ' : '';
  const event = await calendar.events.insert({
    calendarId: tenant.googleCalendarId,
    requestBody: {
      summary: `${urgentPrefix}${opts.serviceType} — ${opts.customerPhone}`,
      description: `Problem: ${opts.description}\nCustomer: ${opts.customerPhone}`,
      location: opts.address,
      start: { dateTime: opts.startTime.toISOString() },
      end: { dateTime: endTime.toISOString() },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 60 },
          { method: 'popup', minutes: 15 },
        ],
      },
    },
  });

  return {
    eventId: event.data.id ?? '',
    calendarLink: event.data.htmlLink ?? '',
  };
}

/**
 * Deletes a Google Calendar event (e.g. if customer cancels).
 */
export async function deleteCalendarEvent(tenant: TenantConfig, eventId: string): Promise<void> {
  const calendar = getCalendarClient(tenant);
  await calendar.events.delete({
    calendarId: tenant.googleCalendarId,
    eventId,
  });
}
