// lib/chat.js
//
// "Ask Trend" backend. Keeps the same rule as the generation engine: the
// model answers from structured signal data, never from thin air. For each
// known topic we hold a small mock signal series (stand-in for a real
// ingestion pipeline) and route it through generateTrendCard's math, then
// let the model answer the user's specific question grounded in that data.

import { chatWithTrend, computeSignalStats, computeConfidence } from './trend-engine.mjs';

const TOPICS = {
  'chips': { name: 'On-device AI chips', domain: 'tech', series: [12,13,14,16,19,24,31,40,52,68], sourceCount: 3 },
  'ai chips': { name: 'On-device AI chips', domain: 'tech', series: [12,13,14,16,19,24,31,40,52,68], sourceCount: 3 },
  'glp-1': { name: 'GLP-1 adjacent supplements', domain: 'health', series: [8,9,11,15,21,29,40,55,74,98], sourceCount: 2 },
  'glp1': { name: 'GLP-1 adjacent supplements', domain: 'health', series: [8,9,11,15,21,29,40,55,74,98], sourceCount: 2 },
  'resale': { name: 'Resale fashion', domain: 'fashion', series: [20,22,24,27,31,36,42,49,57,66], sourceCount: 2 },
  'fashion': { name: 'Resale fashion', domain: 'fashion', series: [20,22,24,27,31,36,42,49,57,66], sourceCount: 2 },
  'music': { name: 'AI-generated music', domain: 'music', series: [3,4,4,6,7,9,12,15,19,24], sourceCount: 2 },
};

function matchTopic(message) {
  const q = message.toLowerCase();
  for (const key of Object.keys(TOPICS)) {
    if (q.includes(key)) return TOPICS[key];
  }
  return null;
}

/**
 * @param {string} message - the user's chat message
 * @returns {Promise<{reply:string, topic:string|null, confidence:number|null}>}
 */
export async function handleChatMessage(message) {
  const topic = matchTopic(message);
  const signal = topic
    ? {
        name: topic.name,
        domain: topic.domain,
        sourceCount: topic.sourceCount,
        ...computeSignalStats(topic.series, topic.sourceCount),
      }
    : null;
  const confidence = signal ? computeConfidence(signal) : null;
  const reply = await chatWithTrend({
    userMessage: message,
    signal: signal ? { ...signal, confidence } : null,
  });
  return { reply, topic: topic?.name || null, confidence };
}
