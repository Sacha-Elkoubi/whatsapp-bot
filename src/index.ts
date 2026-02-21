import path from 'path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { registerWebhooks } from './webhooks/meta.js';
import { registerDashboardRoutes } from './api/dashboard.js';
import { initCron } from './services/cron.js';

const app = Fastify({ logger: true });

// Serve static files (dashboard.html)
app.register(fastifyStatic, {
  root: path.join(__dirname, 'static'),
});

// Routes
registerWebhooks(app);
registerDashboardRoutes(app);

app.get('/health', async () => ({ status: 'ok' }));

// Start server + cron
app.listen({ port: config.port, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  initCron();
});
