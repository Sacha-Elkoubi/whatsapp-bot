import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  anthropic: {
    apiKey: required('ANTHROPIC_API_KEY'),
  },
  webhook: {
    verifyToken: required('VERIFY_TOKEN'),
  },
  jwt: {
    secret: required('JWT_SECRET'),
  },
};
