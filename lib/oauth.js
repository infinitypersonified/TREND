// lib/oauth.js
//
// Real Google OAuth2 (authorization code flow), using Google's own
// googleapis client. This is NOT a stub — the redirect, token exchange, and
// profile fetch are all real calls to Google. It only "does nothing" until
// you supply real credentials, because Google requires every app to be
// registered before it will hand out tokens for it. That part can't be
// faked by me or anyone — it's how OAuth is designed to work.
//
// To activate:
//   1. console.cloud.google.com -> create a project -> OAuth consent screen
//   2. Create OAuth client ID (type: Web application)
//   3. Add authorized redirect URI: http://localhost:3000/auth/google/callback
//      (or your real domain's equivalent)
//   4. Set env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI

import { google } from 'googleapis';

export function googleEnabled() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

function client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getGoogleAuthUrl() {
  return client().generateAuthUrl({
    access_type: 'online',
    scope: ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'],
    prompt: 'select_account'
  });
}

/**
 * Exchanges the authorization code Google sent back for tokens, then fetches
 * the user's basic profile.
 * @returns {Promise<{googleId:string, email:string, name:string}>}
 */
export async function exchangeGoogleCode(code) {
  const oauth2Client = client();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
  const { data } = await oauth2.userinfo.get();
  return { googleId: data.id, email: data.email, name: data.name || data.email.split('@')[0] };
}
