# Trend — full-stack app

A real, runnable app: landing page, signup/login (+ Google OAuth, real but
inactive until you add credentials), onboarding, an Instagram-style feed with
changeable true/false votes and double-tap-to-invite, photo/video posts,
comment threading, a personalized For You feed, a leaderboard, a markets tab
with a momentum read, real push notifications, email notifications, a real
profile page, and an Ask Trend chat. All backed by an actual Express server
and a real SQLite database — nothing here is a static mockup.

## Run it

```
cd trend-app
npm install
npm start
```

Then open http://localhost:3000.

## Pages

```
index.html        Marketing landing page (public)
signup.html       Create an account (+ Google button if configured)
login.html        Log in (+ Google button if configured)
onboarding.html   "What are you into?" — pick domains right after signup
app.html          Feed / For You / Leaderboard / Markets / Ask Trend (login required)
profile.html      Stats, bio, your posts grid, notification opt-in
oauth-bridge.html Internal — hands off the token after a Google login
```

## What's new in this pass

- **Real SQLite database** (`node:sqlite`, built into Node — no native
  compile step, no extra dependency). Each write is a single-row SQL
  operation now instead of rewriting an entire JSON file. `lib/db.js` keeps
  the exact same `collection()` API as before, so nothing else had to change.
- **Vote changing** — tap to vote, tap the same choice again to retract it,
  tap the other side to switch. Double-tap still opens the invite popover.
  All enforced server-side.
- **Onboarding questionnaire**, **~100 seed posts** across 5 domains, and a
  **markets tab with 15 tickers** + a momentum read — carried over and
  confirmed still working.
- **For You tab** — a real ranking: domain match (3x) + recency (decays over
  ~10 days) + engagement (log-scaled votes/reacts). Requires login.
- **Leaderboard tab** — top-voted claims for today/this week/this month,
  server-computed from real vote counts.
- **Comment threading** — one level of replies, with a Reply button per
  top-level comment.
- **Rate limiting** — real, via `express-rate-limit`: 10 signup/login
  attempts per 15 min, 20 posts per minute. Tested: the 21st post in a
  minute gets a 429.
- **Real push notifications** — Web Push over VAPID (`lib/push.js`). Keys are
  generated once and saved to `data/vapid.json`. Click "🔔 Enable
  notifications" on your profile page to subscribe (needs a real browser —
  this can't be demoed from a server-only test). You get pushed when someone
  comments on your post.
- **Real email notifications** — `lib/email.js` sends via any SMTP provider
  if `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` are set. Without them, it logs
  what it *would* have sent instead of silently pretending to send it.
- **Real Google OAuth** (`lib/oauth.js`, `/auth/google`, `/auth/google/callback`)
  — the actual authorization-code flow against Google's API. It's inactive
  until you register an app with Google and set three env vars (below) —
  that registration step can't be done by me, it's tied to a Google account
  you control.

## Activating the parts that need your own credentials

| Feature | Env vars | Where to get them |
|---|---|---|
| Google sign-in | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | console.cloud.google.com → OAuth client ID (redirect URI: `.../auth/google/callback`) |
| Email notifications | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Any SMTP provider — SendGrid, Mailgun, or a Gmail app password |
| AI generation / Ask Trend | Ollama; optional `OLLAMA_API_URL` and `TREND_MODEL` | ollama.com |
| JWT signing | `JWT_SECRET` | any long random string — has an insecure dev fallback otherwise |

Push notifications need **no** external credentials — the VAPID keys are
generated locally on first run.

## What's real vs. mocked

**Real:** auth (bcrypt + JWT + Google OAuth), the SQLite database, voting
(cast/change/retract)/reactions/comments/threading/media, rate limiting, push
notifications (mechanism is real; delivery needs a real browser to test), the
AI layer (Ollama-backed chat and trend generation), and email (real send when
SMTP is configured, honest log otherwise).

**Mocked (by design, for a prototype):** markets price series and the
momentum read (sample data — explicitly not investment advice), Ask Trend's
signal data (4 hardcoded demo topics), the ~100 seed posts, and the
invite link (copies a URL, doesn't send anything on its own).

## Known limitations to fix before shipping

- `node:sqlite` is still an experimental Node API — stable enough for a
  prototype, but watch Node's release notes before relying on it long-term.
- The `find`/`filter` methods in `lib/db.js` load a whole collection into
  memory and filter in JS rather than using SQL `WHERE` — fine at this scale,
  worth indexing properly before real traffic.
- No email verification on signup.
- Base64 media in SQLite still doesn't scale — move to real object storage
  (S3, Cloudflare R2, etc.) before real users show up.
- The For You ranking and leaderboard recompute on every request — fine now,
  should be cached/precomputed at real scale.
