/**
 * Trend Engine
 *
 * Architecture:
 * 1. JavaScript calculates all numerical trend statistics.
 * 2. JavaScript decides whether a signal is strong enough.
 * 3. Ollama handles language, conversation and personality.
 * 4. Ollama never invents numerical statistics.
 *
 * Requires:
 *   Node.js 18+
 *   Ollama running locally
 *
 * Default model:
 *   llama3.2:latest
 *
 * You can override it with:
 *   TREND_MODEL=llama3.2:1b
 */

const OLLAMA_API_URL =
  process.env.OLLAMA_API_URL || "http://localhost:11434/api/chat";

const MODEL =
  process.env.TREND_MODEL || "llama3.2:latest";

const OLLAMA_TIMEOUT_MS = 60_000;

/**
 * ---------------------------------------------------------
 * TREND MATH
 * ---------------------------------------------------------
 */

function mean(values) {
  if (!values.length) return 0;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;

  const avg = mean(values);

  const variance =
    values.reduce((sum, value) => {
      return sum + Math.pow(value - avg, 2);
    }, 0) / values.length;

  return Math.sqrt(variance);
}

function computeVelocity(series) {
  if (series.length < 2) return 0;

  const first = series[0];
  const last = series[series.length - 1];

  if (first === 0) {
    return last - first;
  }

  return (last - first) / Math.abs(first);
}

function computeAcceleration(series) {
  if (series.length < 3) return 0;

  const midpoint = Math.floor(series.length / 2);

  const firstHalf = series.slice(0, midpoint);
  const secondHalf = series.slice(midpoint);

  const firstVelocity =
    firstHalf.length >= 2
      ? (firstHalf[firstHalf.length - 1] - firstHalf[0]) /
        Math.max(Math.abs(firstHalf[0]), 1)
      : 0;

  const secondVelocity =
    secondHalf.length >= 2
      ? (secondHalf[secondHalf.length - 1] - secondHalf[0]) /
        Math.max(Math.abs(secondHalf[0]), 1)
      : 0;

  return secondVelocity - firstVelocity;
}

function computeZScore(series) {
  if (series.length < 2) return 0;

  const avg = mean(series);
  const sd = standardDeviation(series);

  if (sd === 0) return 0;

  const latest = series[series.length - 1];

  return (latest - avg) / sd;
}

/**
 * Calculate deterministic signal statistics.
 *
 * The LLM does NOT calculate these.
 */
function computeSignalStats(series, sourceCount = 0) {
  if (!Array.isArray(series) || series.length === 0) {
    throw new Error("series must be a non-empty array");
  }

  const cleanSeries = series
    .map(Number)
    .filter(Number.isFinite);

  if (cleanSeries.length === 0) {
    throw new Error("series contains no valid numeric values");
  }

  const velocity = computeVelocity(cleanSeries);
  const acceleration = computeAcceleration(cleanSeries);
  const zScore = computeZScore(cleanSeries);

  /**
   * Data quality:
   *
   * More observations + more sources = stronger evidence.
   */
  const observationQuality = Math.min(
    cleanSeries.length / 20,
    1
  );

  const sourceQuality = Math.min(
    Math.max(Number(sourceCount) || 0, 0) / 10,
    1
  );

  const dataQuality =
    observationQuality * 0.6 +
    sourceQuality * 0.4;

  return {
    latestValue: cleanSeries[cleanSeries.length - 1],
    observationCount: cleanSeries.length,
    sourceCount: Number(sourceCount) || 0,
    velocity,
    acceleration,
    zScore,
    dataQuality,
  };
}

/**
 * Convert signal statistics into deterministic confidence.
 */
function computeConfidence(stats) {
  const velocityScore = Math.min(
    Math.abs(stats.velocity) * 100,
    100
  );

  const accelerationScore = Math.min(
    Math.abs(stats.acceleration) * 100,
    100
  );

  const zScoreScore = Math.min(
    Math.abs(stats.zScore) * 25,
    100
  );

  const qualityScore = stats.dataQuality * 100;

  const confidence =
    velocityScore * 0.25 +
    accelerationScore * 0.15 +
    zScoreScore * 0.30 +
    qualityScore * 0.30;

  return Math.round(
    Math.max(0, Math.min(confidence, 100))
  );
}

/**
 * Determine whether the signal is strong enough
 * to be treated as a trend.
 */
function clearsThreshold(
  stats,
  {
    minZScore = 1.2,
    minDataQuality = 0.35,
  } = {}
) {
  return (
    Math.abs(stats.zScore) >= minZScore &&
    stats.dataQuality >= minDataQuality
  );
}

/**
 * ---------------------------------------------------------
 * CONVERSATIONAL AI PROMPT
 * ---------------------------------------------------------
 */

function buildMessages({
  userMessage = "",
  signal = null,
  conversation = [],
}) {
  const systemPrompt = `
You are Trend, a smart conversational market and trend intelligence assistant.

You are NOT a formal financial adviser and you should not pretend to be one.

Your job is to help users discover, understand and explore things that are currently interesting, popular, emerging or gaining momentum.

You can discuss:

- stocks
- companies
- cryptocurrencies
- commodities
- industries
- technologies
- startups
- markets
- investment themes
- business trends
- consumer trends
- emerging opportunities
- general topics outside finance

You should also be capable of having normal conversations.

PERSONALITY:

Talk like a smart, confident human who actually understands the conversation.

Match the user's communication style naturally.

If the user is casual, be casual.

If they use slang, you can use light slang.

If they joke, you can joke back.

If they're serious, become more serious.

If they're excited, match some of that energy.

You can occasionally use witty, quirky or playful phrasing when it fits the conversation.

Do NOT force jokes.

Do NOT use slang in every response.

Do NOT sound like a corporate financial chatbot.

Do NOT repeatedly give generic disclaimers.

CONVERSATION:

Remember what the user has said earlier in the conversation and use that context when responding.

If the user asks a follow-up question, understand what they are referring to instead of treating it as a completely new question.

For example:

User:
"What's hot?"

Assistant:
"AI infrastructure is getting interesting..."

User:
"Anything outside tech?"

Assistant:
"Yep. Copper is one to watch..."

The second response should understand that "anything" refers to currently hot opportunities.

TREND DISCOVERY:

When the user asks what is hot, trending, moving, emerging, gaining attention, or worth watching, identify relevant opportunities from the supplied data.

You may mention specific:

- companies
- stocks
- cryptocurrencies
- commodities
- sectors
- industries
- technologies
- investment themes

You ARE allowed to name specific assets, companies, sectors, industries and themes.

You ARE allowed to say something is:

- hot
- trending
- gaining momentum
- worth watching
- heating up
- interesting

when the supplied signal supports that description.

Do NOT tell the user that they personally must buy or sell something.

Do NOT invent market data.

Only make factual claims about current trends when they are supported by the supplied data.

NUMBERS:

The JavaScript engine calculates numerical trend statistics.

Never invent or alter:

- prices
- percentages
- confidence scores
- velocity
- acceleration
- dates
- source counts
- z-scores
- other numerical statistics

Use supplied statistics as evidence.

Do not recalculate them.

GENERAL QUESTIONS:

If the user asks something unrelated to trend detection, answer normally when the supplied information is enough.

Do NOT force every conversation back into investing.

If the user asks something like:

"Explain AI to me"

answer the question normally.

If the user asks:

"Why is NVIDIA interesting?"

explain the relevant trend information provided.

If the user asks:

"What's hot outside tech?"

use the available signal data and explain the relevant non-tech trends.

If the user asks:

"What do you think?"

provide useful analysis and explain the reasoning.

Do not hide behind repetitive generic disclaimers.

CONTEXT:

The previous conversation is provided separately.

Use it.

Do not repeat questions that have already been answered.

If the user says:

"tell me more"

understand what they were talking about previously.

If they say:

"what about crypto?"

understand that they are asking for the same type of trend analysis, but within crypto.

RESPONSE STYLE:

Be concise by default.

Prefer natural conversational language over rigid templates.

Avoid unnecessary headings.

Avoid corporate language.

Avoid robotic disclaimers.

Sound intelligent without sounding academic.

Be useful first.

Be quirky when the moment calls for it.

Do not overdo emojis.

Do not make every response sound like a social media post.

Most importantly:

You are Trend.

You should feel like a smart assistant that understands what the user is asking, remembers the conversation, explains things clearly and occasionally has personality.

The goal is:

SMART + NATURAL + CONTEXT-AWARE + QUIRKY WHEN APPROPRIATE.
`;

  const contextMessages = Array.isArray(conversation)
    ? conversation
        .filter(
          (message) =>
            message &&
            typeof message.role === "string" &&
            typeof message.content === "string"
        )
        .slice(-12)
        .map((message) => ({
          role:
            message.role === "assistant"
              ? "assistant"
              : "user",
          content: message.content,
        }))
    : [];

  const signalMessage = signal
    ? `
CURRENT TREND SIGNAL DATA:

${JSON.stringify(signal, null, 2)}

IMPORTANT:
This data is authoritative for the numerical signal.
Do not invent numbers.
`
    : `
No trend signal data was supplied for this message.

Do not pretend that you have live market data.
If the user asks what is currently hot and no current data is supplied,
explain that the current signal data is unavailable.
`;

  return [
    {
      role: "system",
      content: systemPrompt,
    },

    ...contextMessages,

    {
      role: "user",
      content: `
${signalMessage}

USER MESSAGE:

${userMessage}
`,
    },
  ];
}

/**
 * ---------------------------------------------------------
 * OLLAMA
 * ---------------------------------------------------------
 */

async function callOllama(messages) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, OLLAMA_TIMEOUT_MS);

  try {
    const response = await fetch(OLLAMA_API_URL, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        model: MODEL,
        messages,

        stream: false,

        options: {
          temperature: 0.7,
        },
      }),

      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(
        `Ollama request failed (${response.status}): ${errorText}`
      );
    }

    const data = await response.json();

    const content =
      data?.message?.content;

    if (
      typeof content !== "string" ||
      !content.trim()
    ) {
      throw new Error(
        "Ollama returned an empty response"
      );
    }

    return content.trim();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * ---------------------------------------------------------
 * TREND CARD
 * ---------------------------------------------------------
 *
 * This function is kept for the parts of your app
 * that already expect a structured trend card.
 */

function buildTrendCardPrompt(signal) {
  return `
Using the supplied trend signal, return ONLY valid JSON.

Do not invent any numbers.

Use this exact structure:

{
  "headline": "Short description of what is trending.",
  "rationale": "Explain why the supplied signal indicates momentum.",
  "watch_for": "Explain what future signal would weaken or strengthen the trend."
}

Signal:

${JSON.stringify(signal, null, 2)}
`;
}

function parseJsonResponse(content) {
  try {
    return JSON.parse(content);
  } catch {
    const cleaned = content
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    try {
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
}

function validateTrendCard(card) {
  if (!card || typeof card !== "object") {
    return false;
  }

  if (
    typeof card.headline !== "string" ||
    typeof card.rationale !== "string" ||
    typeof card.watch_for !== "string"
  ) {
    return false;
  }

  const wordCount = card.headline
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;

  if (wordCount > 18) {
    return false;
  }

  return true;
}

/**
 * Generate the structured trend card used by the
 * existing Trend UI.
 */
async function generateTrendCard({
  asset,
  category,
  series,
  sourceCount = 0,
  conversation = [],
}) {
  const stats = computeSignalStats(
    series,
    sourceCount
  );

  const confidence = computeConfidence(stats);

  const passesThreshold =
    clearsThreshold(stats);

  const signal = {
    asset,
    category,
    ...stats,
    confidence,
    passesThreshold,
  };

  if (!passesThreshold) {
    return {
      detected: false,
      asset,
      category,
      ...stats,
      confidence,
      card: null,
    };
  }

  const messages = buildMessages({
    userMessage: buildTrendCardPrompt(signal),
    signal,
    conversation,
  });

  const rawResponse =
    await callOllama(messages);

  const parsed =
    parseJsonResponse(rawResponse);

  if (!validateTrendCard(parsed)) {
    throw new Error(
      `Ollama returned an invalid trend card:\n${rawResponse}`
    );
  }

  return {
    detected: true,

    asset,
    category,

    confidence,

    velocity: stats.velocity,
    acceleration: stats.acceleration,
    zScore: stats.zScore,
    dataQuality: stats.dataQuality,

    headline: parsed.headline,
    rationale: parsed.rationale,
    watch_for: parsed.watch_for,
  };
}

/**
 * ---------------------------------------------------------
 * GENERAL CONVERSATION
 * ---------------------------------------------------------
 *
 * Use this when the user is chatting normally.
 *
 * Example:
 *
 * await chatWithTrend({
 *   userMessage: "Bro what's going on with AI?",
 *   conversation: [...]
 * });
 */

async function chatWithTrend({
  userMessage,
  conversation = [],
  signal = null,
}) {
  if (
    typeof userMessage !== "string" ||
    !userMessage.trim()
  ) {
    throw new Error(
      "userMessage must be a non-empty string"
    );
  }

  const messages = buildMessages({
    userMessage,
    signal,
    conversation,
  });

  return await callOllama(messages);
}

/**
 * ---------------------------------------------------------
 * MOCK MODE
 * ---------------------------------------------------------
 */

function mockTrendCard({
  asset,
  category,
  series,
  sourceCount = 0,
}) {
  const stats = computeSignalStats(
    series,
    sourceCount
  );

  const confidence =
    computeConfidence(stats);

  const passesThreshold =
    clearsThreshold(stats);

  return {
    detected: passesThreshold,

    asset,
    category,

    confidence,

    velocity: stats.velocity,
    acceleration: stats.acceleration,
    zScore: stats.zScore,
    dataQuality: stats.dataQuality,

    headline: passesThreshold
      ? `${asset} is showing rising momentum.`
      : `${asset} is not showing a strong enough signal yet.`,

    rationale:
      `The current signal has a velocity of ${stats.velocity.toFixed(
        3
      )}, an acceleration of ${stats.acceleration.toFixed(
        3
      )}, and a z-score of ${stats.zScore.toFixed(
        2
      )}.`,

    watch_for:
      "Watch whether the signal continues strengthening across future observations.",
  };
}

/**
 * ---------------------------------------------------------
 * HELPERS
 * ---------------------------------------------------------
 */

function isOllamaAvailableError(error) {
  return (
    error?.cause?.code === "ECONNREFUSED" ||
    String(error?.message || "").includes(
      "ECONNREFUSED"
    ) ||
    String(error?.message || "").includes(
      "fetch failed"
    )
  );
}

function getModel() {
  return MODEL;
}

function getOllamaUrl() {
  return OLLAMA_API_URL;
}

/**
 * ---------------------------------------------------------
 * EXPORTS
 * ---------------------------------------------------------
 */

export {
  computeSignalStats,
  computeConfidence,
  clearsThreshold,

  generateTrendCard,
  chatWithTrend,

  mockTrendCard,

  getModel,
  getOllamaUrl,
  isOllamaAvailableError,
};
