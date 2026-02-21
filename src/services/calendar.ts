import { google } from 'googleapis';
import { config } from '../config.js';

// Slot duration in minutes per service type
const SLOT_DURATION_MINUTES: Record<string, number> = {
  Plumber: 120,
  Electrician: 120,
  Locksmith: 60,
  Handyman: 60,
};

const DEFAULT_DURATION = 120;

// Business hours: Mon–Fri, 08:00–18:00
const BUSINESS_START_HOUR = 8;
const BUSINESS_END_HOUR = 18;

function getCalendarClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: config.google.serviceAccountEmail,
      private_key: config.google.privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  return google.calendar({ version: 'v3', auth });
}

/** Round up to next slot boundary (on the hour or half-hour) */
function roundUpToSlot(date: Date, durationMin: number): Date {
  const d = new Date(date);
  // Round up to nearest `durationMin` boundary within the hour
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
function nextBusinessStart(from: Date): Date {
  const d = new Date(from);
  const day = d.getDay(); // 0=Sun, 6=Sat

  // If weekend, move to Monday
  if (day === 0) d.setDate(d.getDate() + 1);
  if (day === 6) d.setDate(d.getDate() + 2);

  // If after business hours, move to next business day 8am
  if (d.getHours() >= BUSINESS_END_HOUR) {
    d.setDate(d.getDate() + 1);
    d.setHours(BUSINESS_START_HOUR, 0, 0, 0);
    return nextBusinessStart(d); // recurse in case we landed on weekend
  }

  // If before business hours, set to 8am today
  if (d.getHours() < BUSINESS_START_HOUR) {
    d.setHours(BUSINESS_START_HOUR, 0, 0, 0);
  }

  return d;
}

function isBusinessHour(date: Date): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false; // weekend
  const hour = date.getHours();
  return hour >= BUSINESS_START_HOUR && hour < BUSINESS_END_HOUR;
}

/**
 * Returns up to 3 available start times from Google Calendar.
 * Searches within the next 5 business days.
 */
export async function getAvailableSlots(serviceType: string): Promise<Date[]> {
  const durationMin = SLOT_DURATION_MINUTES[serviceType] ?? DEFAULT_DURATION;
  const calendar = getCalendarClient();

  const now = new Date();
  // Add 30-min buffer so we don't offer slots starting in the next few minutes
  now.setMinutes(now.getMinutes() + 30);

  const searchStart = nextBusinessStart(now);
  const searchEnd = new Date(searchStart);
  searchEnd.setDate(searchEnd.getDate() + 7); // look up to 7 calendar days ahead

  // Get busy blocks from Google Calendar
  const freebusyRes = await calendar.freebusy.query({
    requestBody: {
      timeMin: searchStart.toISOString(),
      timeMax: searchEnd.toISOString(),
      items: [{ id: config.google.calendarId }],
    },
  });

  const busyBlocks =
    freebusyRes.data.calendars?.[config.google.calendarId]?.busy ?? [];

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
      isBusinessHour(cursor) &&
      slotEnd.getHours() <= BUSINESS_END_HOUR &&
      !(slotEnd.getHours() === BUSINESS_END_HOUR && slotEnd.getMinutes() > 0)
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
    if (cursor.getHours() >= BUSINESS_END_HOUR) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(BUSINESS_START_HOUR, 0, 0, 0);
      cursor = nextBusinessStart(cursor);
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
export async function createCalendarEvent(opts: {
  serviceType: string;
  description: string;
  address: string;
  customerPhone: string;
  startTime: Date;
}): Promise<CalendarEvent> {
  const durationMin = SLOT_DURATION_MINUTES[opts.serviceType] ?? DEFAULT_DURATION;
  const endTime = new Date(opts.startTime.getTime() + durationMin * 60 * 1000);
  const calendar = getCalendarClient();

  const event = await calendar.events.insert({
    calendarId: config.google.calendarId,
    requestBody: {
      summary: `${opts.serviceType} — ${opts.customerPhone}`,
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
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const calendar = getCalendarClient();
  await calendar.events.delete({
    calendarId: config.google.calendarId,
    eventId,
  });
}
