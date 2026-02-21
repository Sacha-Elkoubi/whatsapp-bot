import { sendText, sendButtons, sendList } from '../services/whatsapp.js';

export const SERVICES = [
  { id: 'svc_plumber', title: 'Plumber', description: 'Leaks, pipes, boilers' },
  { id: 'svc_locksmith', title: 'Locksmith', description: 'Locks, keys, security' },
  { id: 'svc_electrician', title: 'Electrician', description: 'Wiring, fuses, sockets' },
  { id: 'svc_handyman', title: 'Handyman', description: 'General repairs & fixes' },
];

export async function sendWelcomeMenu(to: string): Promise<void> {
  // Using list (not buttons) to support 4 options — WhatsApp buttons max out at 3
  await sendList(
    to,
    `👋 Welcome! I'm your service booking assistant.\n\nHow can I help you today?`,
    'Choose an option',
    [
      { id: 'menu_request', title: '🔧 Request a Service', description: 'Book a plumber, locksmith, electrician...' },
      { id: 'menu_quote', title: '💰 Get a Quote', description: 'Estimate cost before booking' },
      { id: 'menu_faq', title: '❓ FAQ', description: 'Hours, pricing, coverage & more' },
      { id: 'menu_human', title: '👤 Speak to Someone', description: 'Connect with our team directly' },
    ]
  );
}

export async function sendFAQMenu(to: string): Promise<void> {
  await sendList(
    to,
    '❓ *Frequently Asked Questions*\n\nSelect a topic or just type your question:',
    'Browse FAQs',
    [
      { id: 'faq_hours', title: '🕐 Opening Hours', description: 'When are you available?' },
      { id: 'faq_price', title: '💰 Pricing & Rates', description: 'How much does it cost?' },
      { id: 'faq_urgent', title: '🚨 Emergency Service', description: 'Same-day or urgent help' },
      { id: 'faq_area', title: '📍 Coverage Area', description: 'Do you cover my location?' },
      { id: 'faq_payment', title: '💳 Payment Methods', description: 'Cash, card, bank transfer?' },
      { id: 'faq_guarantee', title: '✅ Guarantee & Insurance', description: 'Are you insured?' },
    ]
  );
}

export async function sendServiceMenu(to: string): Promise<void> {
  await sendList(
    to,
    'Which service do you need?\n\nSelect from the list below 👇',
    'Choose a service',
    SERVICES
  );
}

export async function sendIntakeQuestion(
  to: string,
  step: number,
  serviceType: string
): Promise<void> {
  const questions: Record<number, string> = {
    0: `Great choice! To get started with your *${serviceType}* request, could you briefly describe the problem? (e.g. "leaking kitchen tap")`,
    1: `Thanks! What's the address where you need the service?`,
    2: `Is this urgent? 🚨`,
  };

  if (step === 2) {
    await sendButtons(to, questions[2] ?? '', [
      { id: 'intake_urgent_yes', title: '🚨 Yes, urgent' },
      { id: 'intake_urgent_no', title: '📅 No, can wait' },
    ]);
  } else {
    await sendText(to, questions[step] ?? '');
  }
}

/** Format a Date for display: "Today 2:00pm", "Tomorrow 9:00am", "Mon 14 Apr 10:00am" */
export function formatSlotLabel(date: Date): string {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const isTomorrow =
    date.getDate() === tomorrow.getDate() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getFullYear() === tomorrow.getFullYear();

  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });

  if (isToday) return `Today ${time}`;
  if (isTomorrow) return `Tomorrow ${time}`;

  const day = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day} ${time}`;
}

/** Send a list of available appointment slots for the customer to pick */
export async function sendSlotPicker(to: string, slots: Date[]): Promise<void> {
  if (slots.length === 0) {
    await sendText(
      to,
      `⚠️ No available slots found in the next few days. Our team will contact you shortly to arrange a time.`
    );
    return;
  }

  await sendList(
    to,
    `📅 *Choose your appointment slot*\n\nHere are the next available times for your booking:`,
    'Pick a slot',
    slots.map((slot, i) => ({
      id: `slot_${i}`,
      title: formatSlotLabel(slot),
      description: `Tap to confirm this time`,
    }))
  );
}

export async function sendJobConfirmation(
  to: string,
  details: { service: string; description: string; address: string; urgent: boolean; quoteMin: number; quoteMax: number }
): Promise<void> {
  const urgencyLabel = details.urgent ? '🚨 Urgent (within 2 hours)' : '📅 Scheduled';

  await sendButtons(
    to,
    `✅ *Here's your job summary:*\n\n` +
    `🔧 Service: ${details.service}\n` +
    `📝 Problem: ${details.description}\n` +
    `📍 Address: ${details.address}\n` +
    `⏰ Priority: ${urgencyLabel}\n` +
    `💰 Estimated quote: £${details.quoteMin}–£${details.quoteMax}\n\n` +
    `Shall I confirm this booking?`,
    [
      { id: 'confirm_yes', title: '✅ Confirm Booking' },
      { id: 'confirm_no', title: '❌ Cancel' },
    ]
  );
}
