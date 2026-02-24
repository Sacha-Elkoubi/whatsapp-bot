import path from 'path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { registerWebhooks } from './webhooks/meta.js';
import { registerAuthRoutes } from './api/auth.js';
import { registerDashboardRoutes } from './api/dashboard.js';
import { initCron } from './services/cron.js';

const app = Fastify({ logger: true });

// Serve static files (dashboard.html)
app.register(fastifyStatic, {
  root: path.join(__dirname, 'static'),
});

// Routes (order matters: auth before dashboard so middleware is registered)
registerAuthRoutes(app);       // /api/auth/login, /api/auth/register (no auth required)
registerWebhooks(app);         // /webhook (no auth — Meta sends webhooks here)
registerDashboardRoutes(app);  // /api/* (JWT auth required)

app.get('/health', async () => ({ status: 'ok' }));

// Start server + cron
app.listen({ port: config.port, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  initCron();
});
