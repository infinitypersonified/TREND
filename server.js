// server.js
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import rateLimit from 'express-rate-limit';
import { collection, newId } from './lib/db.js';
import { hashPassword, verifyPassword, signToken, requireAuth, optionalAuth } from './lib/auth.js';
import { handleChatMessage } from './lib/chat.js';
import { seedIfEmpty } from './lib/seed.js';
import { computeSignalStats, computeConfidence } from './lib/trend-engine.mjs';
import { vapidKeys, saveSubscription, removeSubscription, notifyUser } from './lib/push.js';
import { sendEmail } from './lib/email.js';
import { googleEnabled, getGoogleAuthUrl, exchangeGoogleCode } from './lib/oauth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '6mb' }));
app.use('/vendor/lenis', express.static(path.join(__dirname, 'node_modules', 'lenis', 'dist')));
app.use(express.static(path.join(__dirname, 'public')));

seedIfEmpty();

const users = collection('users');
const posts = collection('posts');
const votes = collection('votes');
const reactions = collection('reactions');
const comments = collection('comments');

const publicUser = (u, includeProfileImages = false) => ({
  id: u.id, name: u.name, email: u.email, bio: u.bio, domains: u.domains, hasGoogle: !!u.googleId,
  ...(includeProfileImages ? { avatarUrl: u.avatarUrl || null, coverUrl: u.coverUrl || null } : {})
});

// ---------- rate limiting (real, not decorative) ----------
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a few minutes.' }
});
const postLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Slow down — too many posts in a short time.' }
});

app.get('/api/config', (_req, res) => {
  res.json({ googleEnabled: googleEnabled() });
});

// ---------- auth ----------
app.post('/api/signup', authLimiter, async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, and password are required' });
  if (users.find((u) => u.email === email.toLowerCase())) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }
  const user = {
    id: newId(),
    name,
    email: email.toLowerCase(),
    passwordHash: await hashPassword(password),
    googleId: null,
    bio: '',
    domains: ['tech', 'finance'],
    createdAt: Date.now()
  };
  users.insert(user);
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.post('/api/login', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  const user = users.find((u) => u.email === (email || '').toLowerCase());
  if (!user || !user.passwordHash || !(await verifyPassword(password || '', user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

// ---------- Google OAuth (real flow; inactive until GOOGLE_CLIENT_ID etc. are set) ----------
app.get('/auth/google', (req, res) => {
  if (!googleEnabled()) return res.status(503).send('Google sign-in is not configured on this server yet.');
  res.redirect(getGoogleAuthUrl());
});

app.get('/auth/google/callback', async (req, res) => {
  if (!googleEnabled()) return res.status(503).send('Google sign-in is not configured on this server yet.');
  try {
    const { code } = req.query;
    const profile = await exchangeGoogleCode(code);
    let user = users.find((u) => u.googleId === profile.googleId) || users.find((u) => u.email === profile.email.toLowerCase());
    if (!user) {
      user = {
        id: newId(), name: profile.name, email: profile.email.toLowerCase(),
        passwordHash: null, googleId: profile.googleId, bio: '', domains: [], createdAt: Date.now()
      };
      users.insert(user);
    } else if (!user.googleId) {
      user = users.update((u) => u.id === user.id, { googleId: profile.googleId });
    }
    const token = signToken(user);
    const needsOnboarding = !user.domains || user.domains.length === 0;
    res.redirect(`/oauth-bridge.html?token=${encodeURIComponent(token)}&next=${needsOnboarding ? 'onboarding.html' : 'app.html'}`);
  } catch (err) {
    console.error('Google OAuth callback failed:', err.message);
    res.redirect('/login.html?error=google_failed');
  }
});

// ---------- profile ----------
app.get('/api/me', requireAuth, (req, res) => {
  const user = users.find((u) => u.id === req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(publicUser(user, true));
});

app.put('/api/me', requireAuth, (req, res) => {
  const { bio, domains, avatarUrl, coverUrl } = req.body || {};
  const patch = {};
  if (typeof bio === 'string') patch.bio = bio.slice(0, 280);
  if (Array.isArray(domains)) patch.domains = domains;
  for (const field of ['avatarUrl', 'coverUrl']) {
    if (!Object.hasOwn(req.body || {}, field)) continue;
    const image = field === 'avatarUrl' ? avatarUrl : coverUrl;
    if (image !== null && (typeof image !== 'string' || image.length > 2_500_000 || !/^data:image\/(?:jpeg|png|webp);base64,/.test(image))) {
      return res.status(400).json({ error: `Invalid ${field} image` });
    }
    patch[field] = image;
    if (field === 'avatarUrl') patch.avatarUpdatedAt = Date.now();
  }
  const user = users.update((u) => u.id === req.userId, patch);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(publicUser(user, true));
});

app.get('/api/users/:id/avatar', (req, res) => {
  const user = users.find((u) => u.id === req.params.id);
  const match = user?.avatarUrl?.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return res.sendStatus(404);
  res.set('Cache-Control', 'public, max-age=900');
  res.type(match[1]).send(Buffer.from(match[2], 'base64'));
});

app.get('/api/me/stats', requireAuth, (req, res) => {
  const myPosts = posts.filter((p) => p.authorId === req.userId);
  const myVotes = votes.filter((v) => v.userId === req.userId);
  const myReacts = reactions.filter((r) => r.userId === req.userId);
  const myComments = comments.filter((c) => c.authorId === req.userId);
  res.json({
    posts: myPosts.length,
    votesCast: myVotes.length,
    reactsGiven: myReacts.length,
    comments: myComments.length
  });
});

app.get('/api/me/posts', requireAuth, (req, res) => {
  const mine = posts.filter((p) => p.authorId === req.userId).sort((a, b) => b.createdAt - a.createdAt);
  res.json(mine.map((p) => serializePost(p, req.userId)));
});

// ---------- push notifications (real Web Push via VAPID) ----------
app.get('/api/push/vapid-public-key', (_req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

app.post('/api/push/subscribe', requireAuth, (req, res) => {
  const subscription = req.body;
  if (!subscription || !subscription.endpoint) return res.status(400).json({ error: 'Invalid subscription' });
  saveSubscription(req.userId, subscription);
  res.status(201).json({ subscribed: true });
});

app.post('/api/push/unsubscribe', requireAuth, (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });
  removeSubscription(req.userId, endpoint);
  res.json({ unsubscribed: true });
});

// ---------- feed ----------
function generatedPostImage(post) {
  const description = String(post.text || '').replace(/\s+/g, ' ').slice(0, 420);
  const prompt = `Editorial photograph for a ${post.domain} post: ${description}. No lettering or text.`;
  const seed = String(post.id).split('').reduce((value, character) =>
    (value * 31 + character.charCodeAt(0)) >>> 0, 0);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=900&height=1100&seed=${seed}&model=flux&nologo=true`;
}

function serializePost(post, userId) {
  const myVote = userId ? votes.find((v) => v.postId === post.id && v.userId === userId) : null;
  const myReact = userId ? reactions.find((r) => r.postId === post.id && r.userId === userId) : null;
  const author = users.find((u) => u.id === post.authorId);
  const total = post.trueVotes + post.falseVotes;
  return {
    id: post.id,
    domain: post.domain,
    type: post.type,
    text: post.text,
    authorName: post.authorName,
    authorAvatar: author?.avatarUrl ? `/api/users/${encodeURIComponent(author.id)}/avatar?v=${author.avatarUpdatedAt || 0}` : null,
    createdAt: post.createdAt,
    mediaUrl: post.mediaUrl || generatedPostImage(post),
    mediaGenerated: !post.mediaUrl,
    mediaType: post.mediaType || null,
    truePct: total ? Math.round((post.trueVotes / total) * 100) : 50,
    totalVotes: total,
    reacts: post.reacts,
    commentCount: comments.filter((c) => c.postId === post.id).length,
    myVote: myVote ? myVote.choice : null,
    myReacted: !!myReact
  };
}

app.get('/api/posts', optionalAuth, (req, res) => {
  const { domain, sort } = req.query;
  let all = posts.all();

  if (sort === 'foryou') {
    if (!req.userId) return res.status(401).json({ error: 'Log in to see your personalized feed' });
    const me = users.find((u) => u.id === req.userId);
    const myDomains = new Set(me?.domains || []);
    const now = Date.now();
    all = all
      .map((p) => {
        const ageHours = (now - p.createdAt) / 3_600_000;
        const recency = Math.max(0, 1 - ageHours / (24 * 10)); // decays to 0 over ~10 days
        const engagement = Math.log10(1 + p.trueVotes + p.falseVotes + p.reacts);
        const domainMatch = myDomains.has(p.domain) ? 1 : 0;
        const score = domainMatch * 3 + recency * 2 + engagement;
        return { p, score };
      })
      .sort((a, b) => b.score - a.score)
      .map((x) => x.p);
  } else {
    all = all.sort((a, b) => b.createdAt - a.createdAt);
    if (domain && domain !== 'all') all = all.filter((p) => p.domain === domain);
  }

  res.json(all.map((p) => serializePost(p, req.userId)));
});

app.get('/api/leaderboard', optionalAuth, (req, res) => {
  const { period = 'week', domain = 'all' } = req.query;
  const since = period === 'day' ? Date.now() - 86400000
    : period === 'month' ? Date.now() - 30 * 86400000
    : Date.now() - 7 * 86400000; // default: week

  let candidates = posts.filter((p) => p.type === 'claim' && p.createdAt >= since);
  if (domain !== 'all') candidates = candidates.filter((p) => p.domain === domain);

  const ranked = candidates
    .map((p) => ({ ...p, totalVotes: p.trueVotes + p.falseVotes }))
    .sort((a, b) => b.totalVotes - a.totalVotes)
    .slice(0, 20);

  res.json(ranked.map((p) => serializePost(p, req.userId)));
});

const MAX_MEDIA_CHARS = 6_000_000; // ~4.5MB binary, base64-inflated — matches client-side cap
const MAX_POST_WORDS = 1000;

app.post('/api/posts', requireAuth, postLimiter, (req, res) => {
  const { domain, type, text, mediaUrl, mediaType } = req.body || {};
  const validDomains = ['tech', 'finance', 'health', 'music', 'fashion'];
  const validTypes = ['claim', 'take', 'update'];
  if (!validDomains.includes(domain)) return res.status(400).json({ error: 'Invalid domain' });
  if (!validTypes.includes(type)) return res.status(400).json({ error: 'Invalid type' });
  if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'Text is required' });
  const cleanText = text.trim();
  if (cleanText.split(/\s+/).length > MAX_POST_WORDS) {
    return res.status(400).json({ error: 'Posts are limited to 1,000 words' });
  }
  if (mediaUrl && mediaUrl.length > MAX_MEDIA_CHARS) {
    return res.status(413).json({ error: 'Media file is too large for this prototype' });
  }
  if (mediaUrl && !/^data:(image|video)\//.test(mediaUrl)) {
    return res.status(400).json({ error: 'Unsupported media format' });
  }

  const author = users.find((u) => u.id === req.userId);
  const post = posts.insert({
    id: newId(),
    authorId: req.userId,
    authorName: author ? author.name : 'Someone',
    domain,
    type,
    text: cleanText,
    mediaUrl: mediaUrl || null,
    mediaType: mediaType === 'video' ? 'video' : (mediaUrl ? 'image' : null),
    trueVotes: 0,
    falseVotes: 0,
    reacts: 0,
    createdAt: Date.now()
  });
  res.status(201).json(serializePost(post, req.userId));
});

app.post('/api/posts/:id/vote', requireAuth, (req, res) => {
  const { choice } = req.body || {};
  if (choice !== 'true' && choice !== 'false') return res.status(400).json({ error: 'choice must be "true" or "false"' });
  const post = posts.find((p) => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const existing = votes.find((v) => v.postId === post.id && v.userId === req.userId);

  if (!existing) {
    // first vote on this post
    votes.insert({ id: newId(), postId: post.id, userId: req.userId, choice });
    posts.update((p) => p.id === post.id, choice === 'true'
      ? { trueVotes: post.trueVotes + 1 }
      : { falseVotes: post.falseVotes + 1 });
  } else if (existing.choice === choice) {
    // tapping the same choice again retracts the vote entirely
    votes.remove((v) => v.id === existing.id);
    posts.update((p) => p.id === post.id, choice === 'true'
      ? { trueVotes: Math.max(0, post.trueVotes - 1) }
      : { falseVotes: Math.max(0, post.falseVotes - 1) });
  } else {
    // switching from True to False or vice versa
    votes.update((v) => v.id === existing.id, { choice });
    posts.update((p) => p.id === post.id, choice === 'true'
      ? { trueVotes: post.trueVotes + 1, falseVotes: Math.max(0, post.falseVotes - 1) }
      : { falseVotes: post.falseVotes + 1, trueVotes: Math.max(0, post.trueVotes - 1) });
  }

  const updated = posts.find((p) => p.id === post.id);
  res.json(serializePost(updated, req.userId));
});

app.post('/api/posts/:id/react', requireAuth, (req, res) => {
  const post = posts.find((p) => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const existing = reactions.find((r) => r.postId === post.id && r.userId === req.userId);
  if (existing) return res.status(409).json({ error: 'Already reacted' });
  reactions.insert({ id: newId(), postId: post.id, userId: req.userId });
  const updated = posts.update((p) => p.id === post.id, { reacts: post.reacts + 1 });
  res.json(serializePost(updated, req.userId));
});

app.get('/api/posts/:id/comments', (req, res) => {
  const list = comments.filter((c) => c.postId === req.params.id).sort((a, b) => a.createdAt - b.createdAt);
  res.json(list.map((c) => ({
    id: c.id, authorName: c.authorName, text: c.text, createdAt: c.createdAt, parentId: c.parentId || null
  })));
});

app.post('/api/posts/:id/comments', requireAuth, (req, res) => {
  const { text, parentId } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'Text is required' });
  const post = posts.find((p) => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (parentId && !comments.find((c) => c.id === parentId && c.postId === post.id)) {
    return res.status(400).json({ error: 'Invalid parentId' });
  }
  const author = users.find((u) => u.id === req.userId);
  const comment = comments.insert({
    id: newId(),
    postId: post.id,
    authorId: req.userId,
    authorName: author ? author.name : 'Someone',
    text: text.trim().slice(0, 280),
    parentId: parentId || null,
    createdAt: Date.now()
  });
  res.status(201).json(comment);

  // Notify the post's author — real push + real-or-logged email — but never
  // let a notification failure affect the response we already sent.
  if (post.authorId && post.authorId !== req.userId) {
    const commenterName = author ? author.name : 'Someone';
    const payload = {
      title: 'New comment on your post',
      body: `${commenterName}: ${comment.text.slice(0, 80)}`,
      url: `/app.html?post=${post.id}`
    };
    notifyUser(post.authorId, payload).catch((e) => console.error('push notify failed:', e.message));
    const postAuthor = users.find((u) => u.id === post.authorId);
    if (postAuthor) {
      sendEmail({
        to: postAuthor.email,
        subject: 'New comment on your Trend post',
        text: `${commenterName} commented on your post "${post.text.slice(0, 60)}":\n\n"${comment.text}"`
      }).catch((e) => console.error('email notify failed:', e.message));
    }
  }
});

// ---------- markets (mock series, deterministic per ticker) ----------
const TICKERS = [
  { s: 'NVDA', n: 'Nvidia', d: 'tech', seed: 11 },
  { s: 'META', n: 'Meta', d: 'tech', seed: 23 },
  { s: 'MSFT', n: 'Microsoft', d: 'tech', seed: 17 },
  { s: 'TSM', n: 'Taiwan Semiconductor', d: 'tech', seed: 29 },
  { s: 'COIN', n: 'Coinbase', d: 'finance', seed: 31 },
  { s: 'JPM', n: 'JPMorgan Chase', d: 'finance', seed: 19 },
  { s: 'SOFI', n: 'SoFi Technologies', d: 'finance', seed: 47 },
  { s: 'LLY', n: 'Eli Lilly', d: 'health', seed: 37 },
  { s: 'NVO', n: 'Novo Nordisk', d: 'health', seed: 43 },
  { s: 'DXCM', n: 'Dexcom', d: 'health', seed: 59 },
  { s: 'UMG', n: 'Universal Music', d: 'music', seed: 41 },
  { s: 'SPOT', n: 'Spotify', d: 'music', seed: 13 },
  { s: 'RL', n: 'Ralph Lauren', d: 'fashion', seed: 53 },
  { s: 'ETSY', n: 'Etsy', d: 'fashion', seed: 61 },
  { s: 'LULU', n: 'Lululemon', d: 'fashion', seed: 67 }
];
function rng(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function series(seed, n = 30) {
  const f = rng(seed);
  let v = 100;
  const out = [100];
  for (let i = 0; i < n - 1; i++) { v += (f() - 0.5) * 2.2; out.push(Math.round(v * 100) / 100); }
  return out;
}
app.get('/api/markets', (_req, res) => {
  res.json(TICKERS.map((t) => {
    const s = series(t.seed);
    // Reuse the same velocity/z-score math as the AI generation engine so the
    // "momentum" read is at least internally consistent — this is a heuristic
    // on SAMPLE data, not investment advice, and the UI must say so.
    const stats = computeSignalStats(s, 2);
    const confidence = computeConfidence(stats);
    const direction = stats.zScore > 0.4 ? 'up' : stats.zScore < -0.4 ? 'down' : 'flat';
    const label = direction === 'up' ? 'Upward momentum' : direction === 'down' ? 'Downward momentum' : 'Flat / no clear signal';
    return { ...t, series: s, momentum: { direction, label, confidence } };
  }));
});

// ---------- chat ----------
app.post('/api/chat', optionalAuth, async (req, res) => {
  const { message } = req.body || {};
  if (!message || !message.trim()) return res.status(400).json({ error: 'message is required' });
  try {
    const result = await handleChatMessage(message.trim());
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Trend app running at http://localhost:${PORT}`));
