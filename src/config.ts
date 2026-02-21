import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  whatsapp: {
    token: required('WHATSAPP_TOKEN'),
    phoneNumberId: required('PHONE_NUMBER_ID'),
    verifyToken: required('VERIFY_TOKEN'),
  },
  anthropic: {
    apiKey: required('ANTHROPIC_API_KEY'),
  },
  ownerPhone: required('OWNER_PHONE'),
  google: {
    serviceAccountEmail: required('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
    // Replace literal \n in env var with actual newlines
    privateKey: required('GOOGLE_PRIVATE_KEY').replace(/\\n/g, '\n'),
    calendarId: required('GOOGLE_CALENDAR_ID'),
  },
};
