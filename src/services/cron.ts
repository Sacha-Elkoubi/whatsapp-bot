import cron from 'node-cron';
import { sendDailyDigest } from './digest.js';

export function initCron(): void {
  // Every day at 08:00 (server local time)
  cron.schedule('0 8 * * *', () => {
    sendDailyDigest().catch((err) => {
      console.error('[cron] Daily digest failed:', err);
    });
  });

  console.log('[cron] Daily digest scheduled for 08:00 every day.');
}
