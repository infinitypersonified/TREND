// public/chat.js
window.Chat = (function () {
  function addBubble(text, who) {
    const log = document.getElementById('chatlog');
    const div = document.createElement('div');
    div.className = `bubble ${who}`;
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  async function send() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;
    addBubble(msg, 'me');
    input.value = '';
    addBubble('…', 'ai');
    const log = document.getElementById('chatlog');
    const thinking = log.lastChild;
    try {
      const { reply } = await Trend.api('/api/chat', 'POST', { message: msg });
      thinking.textContent = reply;
    } catch (e) {
      thinking.textContent = `Error: ${e.message}`;
    }
  }

  function init() {
    addBubble('Ask me anything. Demo signal stats are available for AI chips, GLP-1, resale fashion, and music.', 'ai');
    document.getElementById('chatSend').addEventListener('click', send);
    document.getElementById('chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  }

  return { init };
})();
