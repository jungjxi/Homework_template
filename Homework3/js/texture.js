/* Mind Wardrobe — risograph-like paper grain, generated once with p5.js and reused as a CSS tile. */
(function () {
  'use strict';
  const SIZE = 200;

  function apply(url) {
    document.documentElement.style.setProperty('--grain', `url("${url}")`);
  }

  // Plain canvas fallback in case p5 is unavailable.
  function fallback() {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = SIZE;
      const g = c.getContext('2d');
      for (let i = 0; i < 2600; i++) {
        const dark = Math.random() < 0.65;
        g.fillStyle = dark ? `rgba(30,40,60,${0.05 + Math.random() * 0.12})` : 'rgba(255,252,240,0.18)';
        g.fillRect(Math.random() * SIZE, Math.random() * SIZE, 1, 1);
      }
      apply(c.toDataURL('image/png'));
    } catch (e) {
      /* texture is decorative */
    }
  }

  function make() {
    if (typeof window.p5 !== 'function') return fallback();
    try {
      // eslint-disable-next-line no-new
      new window.p5((p) => {
        p.setup = () => {
          p.noCanvas();
          p.randomSeed(7);
          p.noiseSeed(7);
          const g = p.createGraphics(SIZE, SIZE);
          g.pixelDensity(1);
          g.clear();
          g.noStroke();
          for (let i = 0; i < 3000; i++) {
            const x = p.random(SIZE);
            const y = p.random(SIZE);
            const n = p.noise(x * 0.04, y * 0.04);
            if (p.random() < 0.68) g.fill(30, 40, 60, 8 + 24 * n);
            else g.fill(255, 252, 240, 40);
            const s = p.random() < 0.92 ? 1 : 2;
            g.rect(x, y, s, s);
          }
          apply(g.elt.toDataURL('image/png'));
          g.remove();
          p.remove();
        };
      });
    } catch (e) {
      fallback();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', make);
  else make();
})();
