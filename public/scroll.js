import Lenis from '/vendor/lenis/lenis.mjs';

const lenis = new Lenis({
  autoRaf: true,
  anchors: true,
  respectReducedMotion: true,
});

window.TrendLenis = lenis;