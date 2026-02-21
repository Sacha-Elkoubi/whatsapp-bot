interface FAQEntry {
  keywords: string[];
  answer: string;
}

export const FAQS: FAQEntry[] = [
  {
    keywords: ['weekend', 'saturday', 'sunday', 'open', 'hours', 'opening'],
    answer:
      "📅 *Opening Hours*\n\nYes, we're available 7 days a week, including weekends and bank holidays.\n\n• Mon–Fri: 7am–9pm\n• Sat–Sun: 8am–6pm\n\nEmergency call-outs are available 24/7 (out-of-hours surcharge applies).",
  },
  {
    keywords: ['call-out', 'callout', 'charge', 'fee', 'cost', 'price', 'rate', 'quote', 'much'],
    answer:
      "💰 *Standard Rates*\n\n• Plumber: £80–£120 call-out + parts/labour\n• Locksmith: £60–£100 call-out\n• Electrician: £60–£100 call-out\n• Handyman: £40–£60/hr (min. 1 hour)\n\nUrgent/out-of-hours: +30–50%\n\nSend me the details and I'll give you a more accurate estimate! 👇",
  },
  {
    keywords: ['urgent', 'emergency', 'asap', 'tonight', 'now', 'immediately', 'quickly'],
    answer:
      "🚨 *Emergency Service*\n\nYes, we offer same-day and emergency call-outs. An engineer can usually be with you within 60–90 minutes.\n\nShall I book an urgent job for you now? Just tell me what you need! 🔧",
  },
  {
    keywords: ['area', 'cover', 'location', 'zone', 'travel', 'come to', 'radius'],
    answer:
      "📍 *Coverage Area*\n\nWe currently cover central London and surrounding areas up to 15 miles. If you're unsure if we cover your area, share your postcode and I'll check!",
  },
  {
    keywords: ['guarantee', 'warranty', 'guarantee', 'insured', 'insurance', 'accredited'],
    answer:
      "✅ *Our Guarantee*\n\nAll our engineers are fully insured and accredited. Every job comes with a *12-month workmanship guarantee*.\n\nIf anything isn't right after the job, we'll come back and fix it at no extra cost.",
  },
  {
    keywords: ['payment', 'pay', 'card', 'cash', 'invoice', 'bank transfer', 'bacs'],
    answer:
      "💳 *Payment Methods*\n\nWe accept:\n• Cash\n• Credit/debit card\n• Bank transfer (BACS)\n\nPayment is due on completion of work. We can email an invoice if needed.",
  },
  {
    keywords: ['how long', 'long take', 'duration', 'time', 'wait', 'minutes', 'hours'],
    answer:
      "⏱️ *Job Duration*\n\nMost standard jobs take 1–2 hours. Larger or more complex jobs may take longer.\n\nWe'll give you a time estimate on-site before starting any work.",
  },
  {
    keywords: ['cancel', 'rescheduled', 'reschedule', 'postpone', 'change'],
    answer:
      "🔄 *Cancellations & Rescheduling*\n\nYou can cancel or reschedule at no cost up to *2 hours before* the appointment.\n\nTo change a booking, just reply here or call us directly.",
  },
];

/**
 * Returns an FAQ answer if the message contains matching keywords, otherwise null.
 */
export function matchFAQ(text: string): string | null {
  const lower = text.toLowerCase();
  for (const faq of FAQS) {
    if (faq.keywords.some((k) => lower.includes(k))) {
      return faq.answer;
    }
  }
  return null;
}
