// lib/push.js
//
// Real Web Push (the browser Push API), using VAPID — no third-party push
// service, no API key to buy. VAPID keys are generated once and saved to
// disk so they're stable across restarts (subscriptions are tied to the
// public key that created them; rotating it would invalidate every existing
// subscription).

import webpush from 'web-push';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collection, newId } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const VAPID_FILE = path.join(DATA_DIR, 'vapid.json');

function loadOrCreateVapidKeys() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(VAPID_FILE)) {
    return JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8'));
  }
  const keys = webpush.generateVAPIDKeys();
  fs.writeFileSync(VAPID_FILE, JSON.stringify(keys, null, 2));
  return keys;
}

export const vapidKeys = loadOrCreateVapidKeys();

webpush.setVapidDetails(
  'mailto:admin@example.com', // replace with a real contact address before shipping
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

const subs = collection('push_subscriptions');

export function saveSubscription(userId, subscription) {
  const existing = subs.find((s) => s.userId === userId && s.endpoint === subscription.endpoint);
  if (existing) return existing;
  return subs.insert({ id: newId(), userId, endpoint: subscription.endpoint, subscription });
}

export function removeSubscription(userId, endpoint) {
  return subs.remove((s) => s.userId === userId && s.endpoint === endpoint);
}

/**
 * Best-effort push to every subscription a user has registered. Failures
 * (expired subscription, browser push service unreachable, etc.) are logged
 * and swallowed — a notification failing to send should never break the
 * request that triggered it.
 */
export async function notifyUser(userId, payload) {
  const mySubs = subs.filter((s) => s.userId === userId);
  await Promise.all(mySubs.map(async (s) => {
    try {
      await webpush.sendNotification(s.subscription, JSON.stringify(payload));
    } catch (err) {
      // 410/404 means the subscription is dead — clean it up
      if (err.statusCode === 410 || err.statusCode === 404) {
        subs.remove((x) => x.id === s.id);
      } else {
        console.error(`Push to user ${userId} failed:`, err.message);
      }
    }
  }));
}
