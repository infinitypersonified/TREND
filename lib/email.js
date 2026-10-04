// lib/email.js
//
// Real email via nodemailer IF SMTP credentials are configured. Without
// them, this logs what would have been sent instead of pretending to send
// it — a prototype that silently "succeeds" at sending email it never sent
// is worse than one that's honest about not being wired up yet.
//
// To activate: set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.
// Works with any standard SMTP provider (SendGrid, Mailgun, Gmail app
// passwords, etc.) — nodemailer doesn't care which one.

import nodemailer from 'nodemailer';

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return transporter;
}

/**
 * @param {{to:string, subject:string, text:string}} msg
 */
export async function sendEmail({ to, subject, text }) {
  if (!isConfigured()) {
    console.log(`[email skipped — no SMTP configured] Would have sent to ${to}: "${subject}"`);
    return { sent: false, reason: 'not-configured' };
  }
  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text
    });
    return { sent: true };
  } catch (err) {
    console.error('Email send failed:', err.message);
    return { sent: false, reason: err.message };
  }
}
