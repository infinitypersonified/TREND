// public/markets.js — watchlist + chart + a clearly-labeled momentum read.
// The momentum read is a heuristic computed from sample price data. It is
// NOT investment advice — that's stated in the UI, not just this comment.
window.Markets = (function () {
  let tickers = [];
  let sel = 0;
  let loaded = false;

  function spark(a, color, w = 60, h = 24) {
    const mx = Math.max(...a), mn = Math.min(...a), r = (mx - mn) || 1, st = (w - 2) / (a.length - 1);
    const pts = a.map((v, i) => `${(1 + i * st).toFixed(1)},${(h - 2 - ((v - mn) / r) * (h - 4)).toFixed(1)}`).join(' ');
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline fill="none" stroke="${color}" stroke-width="2" points="${pts}"/></svg>`;
  }
  const pct = (a) => (a[a.length - 1] - a[0]) / a[0] * 100;
  const domainLabel = (d) => d.charAt(0).toUpperCase() + d.slice(1);

  function renderWL() {
    document.getElementById('wl').innerHTML = '<h4>Watchlist</h4>' + tickers.map((t, i) => {
      const c = pct(t.series);
      return `<button class="${i === sel ? 'on' : ''}" data-i="${i}">
        <div><b>${t.s}</b><span class="nm">${t.n}</span></div>
        ${spark(t.series, i === sel ? '#fff' : (c >= 0 ? '#16A34A' : '#E5484D'))}
        <div class="px">${t.series[t.series.length - 1].toFixed(2)}<div style="font-size:11px;color:${i === sel ? '#B9B9C2' : (c >= 0 ? '#16A34A' : '#E5484D')}">${c >= 0 ? '+' : ''}${c.toFixed(1)}%</div></div>
      </button>`;
    }).join('');
  }

  const MOM_COLOR = { up: '#16A34A', down: '#E5484D', flat: '#8A8A93' };
  const MOM_ICON = { up: '▲', down: '▼', flat: '●' };

  function renderDet() {
    const t = tickers[sel], a = t.series, c = pct(a), up = c >= 0, col = up ? '#16A34A' : '#E5484D';
    const mx = Math.max(...a), mn = Math.min(...a);
    const W = 560, H = 220, P = 12, r = (mx - mn) || 1;
    const X = (i) => P + i * (W - 2 * P) / (a.length - 1), Y = (v) => H - P - ((v - mn) / r) * (H - 2 * P);
    const line = a.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    const area = `${line} L${X(a.length - 1)},${H - P} L${X(0)},${H - P} Z`;
    const m = t.momentum;
    document.getElementById('det').innerHTML = `
      <div class="det-top">
        <div><h3>${t.s}</h3><div style="color:var(--muted);font-size:13px">${t.n} · ${domainLabel(t.d)}</div></div>
        <div><div class="bigpx">${a[a.length - 1].toFixed(2)}</div><div style="text-align:right;font-weight:700;font-size:14px" class="${up ? 'up-t' : 'down-t'}">${up ? '+' : ''}${c.toFixed(2)}%</div></div>
      </div>
      <svg viewBox="0 0 ${W} ${H}" width="100%" style="margin-top:14px">
        <path d="${area}" fill="${col}" opacity=".12"/>
        <path d="${line}" fill="none" stroke="${col}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${X(a.length-1)}" cy="${Y(a[a.length-1])}" r="4.5" fill="${col}"/>
      </svg>
      <div style="display:flex;gap:16px;margin:14px 0;font-size:12.5px;color:var(--muted)">
        <span>High <b style="color:var(--ink)">${mx.toFixed(2)}</b></span>
        <span>Low <b style="color:var(--ink)">${mn.toFixed(2)}</b></span>
        <span>Range <b style="color:var(--ink)">${((mx-mn)/mn*100).toFixed(1)}%</b></span>
      </div>
      <div style="background:${MOM_COLOR[m.direction]}14;border:1.5px solid ${MOM_COLOR[m.direction]}33;border-radius:14px;padding:14px 16px">
        <div style="display:flex;align-items:center;gap:8px;font-weight:800;font-size:14px;color:${MOM_COLOR[m.direction]}">${MOM_ICON[m.direction]} ${m.label}</div>
        <div style="font-size:12.5px;color:var(--muted);margin-top:4px">Momentum confidence: ${m.confidence}% · computed from this sample price series only</div>
        <div style="font-size:11.5px;color:var(--muted);margin-top:8px;line-height:1.5">This is a heuristic read on <b>sample</b> data for the prototype — not investment advice. A real version would need a licensed market data feed and should still never tell you what to buy or sell.</div>
      </div>`;
  }

  async function init() {
    if (!loaded) {
      tickers = await Trend.api('/api/markets');
      loaded = true;
      document.getElementById('wl').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-i]');
        if (!b) return;
        sel = +b.dataset.i;
        renderWL(); renderDet();
      });
    }
    renderWL(); renderDet();
  }

  return { init };
})();
