/* =====================================================================
   Sanjaya Maharjan — "Survey"
   Zero dependencies. Every module is independent and fails soft: if one
   throws, the rest of the page (and all content) still works.
   ===================================================================== */
(() => {
  'use strict';

  const d = document;
  const root = d.documentElement;
  const $ = (s, c = d) => c.querySelector(s);
  const $$ = (s, c = d) => Array.from(c.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const fract = (x) => x - Math.floor(x);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const fmt = (n) => Math.round(n).toLocaleString('en-US');

  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  const mqFine = matchMedia('(hover: hover) and (pointer: fine)');
  const reduced = mqReduce.matches;
  const fine = mqFine.matches;
  const lockQuality = /[?&]hq/.test(location.search);

  const state = { webgl: false, ascentMode: null, errors: [], frames: 0 };
  window.__sm = state;

  const tickers = [];          // fn(t, dt) every frame
  const onResize = [];         // fn() after debounced resize
  const safe = (name, fn) => { try { return fn(); } catch (e) { state.errors.push(name + ': ' + e.message); console.error('[sm]', name, e); } };

  /* ------------------------------------------------------------------
     Noise — mirrored exactly by the GLSL below so the cursor readout
     reports the elevation of the terrain you are actually pointing at.
     ------------------------------------------------------------------ */
  function hash(x, y) {
    let a = fract(x * 0.1031), b = fract(y * 0.1031), c = fract(x * 0.1031);
    const k = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
    a += k; b += k; c += k;
    return fract((a + b) * c);
  }
  function vnoise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    return lerp(lerp(hash(ix, iy), hash(ix + 1, iy), ux), lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), ux), uy);
  }
  function fbm(x, y, oct) {
    let v = 0, a = 0.5;
    for (let i = 0; i < oct; i++) {
      v += a * vnoise(x, y);
      const nx = 1.6 * x - 1.2 * y, ny = 1.2 * x + 1.6 * y;
      x = nx; y = ny; a *= 0.5;
    }
    return v;
  }
  function terrainH(px, py, t, seed) {
    const qx = fbm(px, py + t * 0.03, 3);
    const qy = fbm(px + 5.2 - t * 0.02, py + 1.3 - t * 0.02, 3);
    return fbm(px + 1.4 * qx + seed, py + 1.4 * qy + seed, 5);
  }
  const n1 = (x) => (vnoise(x, 7.31) * 2 - 1);   // 1-D slice for ridgelines

  /* ------------------------------------------------------------------
     Palette from CSS custom properties (theme-aware)
     ------------------------------------------------------------------ */
  const cssVar = (n) => getComputedStyle(root).getPropertyValue(n).trim();
  function hexToRgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  const readPalette = () => ({
    bg: hexToRgb(cssVar('--t-bg')), high: hexToRgb(cssVar('--t-high')),
    line: hexToRgb(cssVar('--t-line')), idx: hexToRgb(cssVar('--t-index')), acc: hexToRgb(cssVar('--t-accent')),
    lineA: parseFloat(cssVar('--t-line-a')) || 0.2, idxA: parseFloat(cssVar('--t-index-a')) || 0.35,
  });

  /* ------------------------------------------------------------------
     Terrain — WebGL contour map
     ------------------------------------------------------------------ */
  const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  const FRAG = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec3 uMouse; uniform float uSeed; uniform float uReveal;
uniform float uZoom; uniform float uDpr; uniform float uLevels; uniform float uLensR; uniform float uLens;
uniform vec2 uPan; uniform float uFade; uniform float uAlpha;
uniform vec3 uBg, uHigh, uLine, uIdx, uAcc; uniform float uLineA, uIdxA;
uniform sampler2D uTex; uniform float uUseTex; uniform float uTexAspect;
float hash(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float vnoise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}
const mat2 M=mat2(1.6,1.2,-1.2,1.6);
float fbm3(vec2 p){float v=0.,a=.5;for(int i=0;i<3;i++){v+=a*vnoise(p);p=M*p;a*=.5;}return v;}
float fbm5(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*vnoise(p);p=M*p;a*=.5;}return v;}
float terrain(vec2 p){
  vec2 q=vec2(fbm3(p+vec2(0.,uTime*.03)),fbm3(p+vec2(5.2,1.3)-uTime*.02));
  return fbm5(p+1.4*q+uSeed);
}
float band(float v,float w,float px){float d=abs(fract(v+.5)-.5)/max(w,1e-5);return 1.-smoothstep(px*.5-.5,px*.5+.5,d);}
void main(){
  vec2 frag=gl_FragCoord.xy;
  float s=min(uRes.x,uRes.y);
  vec2 uv=(frag-.5*uRes)/s;
  vec2 p=uv*2.4*uZoom+uPan;
  float h=terrain(p);
  float lumS=0.;
  if(uUseTex>.5){
    /* survey a real homepage: its blurred luminance becomes the terrain */
    vec2 suv=frag/uRes; float ca=uRes.x/uRes.y; vec2 tuv=suv;
    if(ca>uTexAspect) tuv.y=(suv.y-.5)*(uTexAspect/ca)+.5; else tuv.x=(suv.x-.5)*(ca/uTexAspect)+.5;
    tuv.y=1.-tuv.y;
    float lb=dot(texture2D(uTex,tuv,4.).rgb,vec3(.299,.587,.114));
    lumS=dot(texture2D(uTex,tuv).rgb,vec3(.299,.587,.114));
    h=mix(h,1.-lb,.8);
  }
  vec2 dm=frag-uMouse.xy; float r=length(dm); float R=uLensR;
  float pres=uMouse.z*uLens;
  float H=h+exp(-(r*r)/(R*R*.8))*.14*pres;
  float fw=fwidth(H);
  float v=H*uLevels; float w=fw*uLevels;
  float lw=max(1.,uDpr*.95);
  float thin=band(v,w,lw)*(1.-smoothstep(.22,.5,w));
  float idx=band(v/5.,w/5.,lw*1.9)*(1.-smoothstep(.25,.6,w/5.));
  float fine=band(v*4.,w*4.,lw*.9)*(1.-smoothstep(.18,.42,w*4.));
  float lens=(1.-smoothstep(R*.5,R,r))*pres;
  float thr=1.-uReveal*1.25;
  float rev=smoothstep(thr-.05,thr+.05,h);
  vec3 col=mix(uBg,uHigh,smoothstep(.3,.78,h));
  col=mix(col,mix(uBg,uLine,lumS),.2*uUseTex);
  col=mix(col,mix(uLine,uAcc,lens*.9),min(1.,thin*uLineA*uAlpha*(1.+lens*1.4))*rev);
  col=mix(col,mix(uIdx,uAcc,lens),min(1.,idx*uIdxA*uAlpha*(1.+lens*.7))*rev);
  col=mix(col,uAcc,fine*lens*.42*rev);
  float dash=step(.5,fract(atan(dm.y,dm.x)/6.28318*72.));
  float ring=(1.-smoothstep(0.,1.1*uDpr,abs(r-R)))*dash*pres;
  col=mix(col,uAcc,ring*.6);
  float tick=((1.-smoothstep(0.,.9*uDpr,abs(dm.x)))+(1.-smoothstep(0.,.9*uDpr,abs(dm.y))))*step(r,8.*uDpr)*step(3.*uDpr,r);
  col=mix(col,uAcc,clamp(tick,0.,1.)*pres*.9);
  float vig=smoothstep(1.3,.2,length(uv*vec2(.8,1.15)));
  col=mix(uBg,col,mix(.3,1.,vig));
  col=mix(uBg,col,uFade);
  col+=(hash(frag+fract(uTime*7.13)*97.)-.5)*.028;
  gl_FragColor=vec4(col,1.);
}`;

  const terrains = [];
  class Terrain {
    constructor(canvas, opts) {
      this.c = canvas;
      this.o = Object.assign({ seed: 0, levels: 28, zoom: 1, lens: 1, lensR: 150, maxDpr: 1.75, alpha: 1, pan: [0, 0] }, opts);
      const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
      if (!gl) throw new Error('WebGL unavailable');
      if (!gl.getExtension('OES_standard_derivatives')) throw new Error('OES_standard_derivatives unavailable');
      this.gl = gl;
      const sh = (type, src) => {
        const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'a');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      this.u = {};
      ['uRes', 'uTime', 'uMouse', 'uSeed', 'uReveal', 'uZoom', 'uDpr', 'uLevels', 'uLensR', 'uLens', 'uPan', 'uFade', 'uAlpha',
        'uBg', 'uHigh', 'uLine', 'uIdx', 'uAcc', 'uLineA', 'uIdxA', 'uTex', 'uUseTex', 'uTexAspect'].forEach((n) => { this.u[n] = gl.getUniformLocation(prog, n); });
      this.blank = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.blank);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0]));
      gl.uniform1i(this.u.uTex, 0);
      this.tex = new Map(); this.curTex = null;
      this.mouse = { x: -1e4, y: -1e4, z: 0, tx: -1e4, ty: -1e4, tz: 0 };
      this.reveal = 1; this.fade = 1; this.zoom = this.o.zoom; this.time = 0;
      this.visible = false; this.q = 1; this.lost = false;
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
      this.setPalette(readPalette());
      this.resize();
      terrains.push(this);
    }
    resize() {
      const r = this.c.getBoundingClientRect();
      this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
      this.dpr = Math.min(window.devicePixelRatio || 1, this.o.maxDpr) * this.q;
      this.c.width = Math.max(1, Math.round(this.w * this.dpr));
      this.c.height = Math.max(1, Math.round(this.h * this.dpr));
      this.gl.viewport(0, 0, this.c.width, this.c.height);
    }
    setPalette(p) { this.p = p; }
    /* cached GL texture for an image URL (power-of-two images get mipmaps, used as blur) */
    texture(src) {
      if (this.tex.has(src)) return this.tex.get(src);
      const gl = this.gl;
      const pr = new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const t = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, t);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
          const pot = (n) => (n & (n - 1)) === 0;
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          if (pot(img.width) && pot(img.height)) {
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
          } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          resolve({ t, aspect: img.width / img.height });
        };
        img.onerror = reject;
        img.src = src;
      });
      this.tex.set(src, pr);
      return pr;
    }
    /* terrain-space coordinates for a CSS-pixel point inside the canvas */
    sample(x, y) {
      const s = Math.min(this.w, this.h);
      const ux = (x - this.w / 2) / s, uy = ((this.h - y) - this.h / 2) / s;
      const px = ux * 2.4 * this.zoom + this.pan[0], py = uy * 2.4 * this.zoom + this.pan[1];
      return terrainH(px, py, this.time, this.o.seed);
    }
    get pan() { return [this.o.pan[0] + this.time * 0.012, this.o.pan[1] + this.time * 0.004]; }
    render() {
      if (this.lost) return;
      const gl = this.gl, u = this.u, p = this.p, m = this.mouse;
      gl.uniform2f(u.uRes, this.c.width, this.c.height);
      gl.uniform1f(u.uTime, this.time);
      gl.uniform3f(u.uMouse, m.x * this.dpr, (this.h - m.y) * this.dpr, m.z);
      gl.uniform1f(u.uSeed, this.o.seed);
      gl.uniform1f(u.uReveal, this.reveal);
      gl.uniform1f(u.uZoom, this.zoom);
      gl.uniform1f(u.uDpr, this.dpr);
      gl.uniform1f(u.uLevels, this.o.levels);
      gl.uniform1f(u.uLensR, this.o.lensR * this.dpr);
      gl.uniform1f(u.uLens, this.o.lens);
      const pan = this.pan; gl.uniform2f(u.uPan, pan[0], pan[1]);
      gl.uniform1f(u.uFade, this.fade);
      gl.uniform1f(u.uAlpha, this.o.alpha);
      gl.uniform3fv(u.uBg, p.bg); gl.uniform3fv(u.uHigh, p.high); gl.uniform3fv(u.uLine, p.line);
      gl.uniform3fv(u.uIdx, p.idx); gl.uniform3fv(u.uAcc, p.acc);
      gl.uniform1f(u.uLineA, p.lineA); gl.uniform1f(u.uIdxA, p.idxA);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.curTex ? this.curTex.t : this.blank);
      gl.uniform1f(u.uUseTex, this.curTex ? 1 : 0);
      gl.uniform1f(u.uTexAspect, this.curTex ? this.curTex.aspect : 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    easeMouse(k) {
      const m = this.mouse;
      m.x = lerp(m.x, m.tx, k); m.y = lerp(m.y, m.ty, k); m.z = lerp(m.z, m.tz, k * 0.7);
    }
  }

  const visibility = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.target.__terrain) e.target.__terrain.visible = e.isIntersecting; });
  }, { rootMargin: '80px 0px' });
  function makeTerrain(canvas, opts) {
    const t = new Terrain(canvas, opts);
    canvas.__terrain = t;
    visibility.observe(canvas);
    state.webgl = true;
    return t;
  }

  /* ------------------------------------------------------------------
     Scramble text (mono labels decode into place)
     ------------------------------------------------------------------ */
  const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789/°·—<>';
  function scramble(el, dur = 750) {
    if (reduced || el.__scrambled) return;
    el.__scrambled = true;
    const nodes = [];
    const walk = d.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) nodes.push({ n: walk.currentNode, t: walk.currentNode.textContent });
    const t0 = performance.now();
    const step = (now) => {
      const k = clamp((now - t0) / dur, 0, 1);
      nodes.forEach(({ n, t }) => {
        const upto = Math.floor(t.length * easeOut(k));
        let out = t.slice(0, upto);
        for (let i = upto; i < t.length; i++) out += t[i] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        n.textContent = out;
      });
      if (k < 1) requestAnimationFrame(step); else nodes.forEach(({ n, t }) => { n.textContent = t; });
    };
    requestAnimationFrame(step);
  }

  /* ------------------------------------------------------------------
     HERO
     ------------------------------------------------------------------ */
  function initHero() {
    const hero = $('.hero');
    const name = $('[data-name]');
    const body = $('.hero-body', hero);
    const readout = $('[data-readout]');
    const roElev = $('[data-ro-elev]');
    const roCoord = $('[data-ro-coord]');

    // split the name into letters for the variable-font intro + cursor proximity
    let ci = 0;
    $$('.name-line', name).forEach((line) => {
      const txt = line.textContent.trim();
      line.textContent = '';
      for (const ch of txt) {
        const s = d.createElement('span');
        s.className = 'ch'; s.textContent = ch; s.style.setProperty('--ci', ci++);
        line.appendChild(s);
      }
    });
    const chars = $$('.ch', name).map((el) => ({ el, cx: 0, cy: 0, w: 100, g: 800 }));

    function fitName() {
      name.style.fontSize = '';
      chars.forEach((c) => { c.el.style.setProperty('--w', 100); c.el.style.setProperty('--g', 800); c.el.style.transition = 'none'; });
      const avail = name.getBoundingClientRect().width;
      const lines = $$('.name-line', name);
      const widest = Math.max(...lines.map((l) => {
        const last = l.lastElementChild;
        return last.getBoundingClientRect().right - l.getBoundingClientRect().left;
      }));
      const fs = parseFloat(getComputedStyle(name).fontSize);
      const byWidth = fs * (avail * 0.9) / widest;
      const byHeight = (window.innerHeight - 300) / 1.72;
      name.style.fontSize = clamp(Math.min(byWidth, Math.max(byHeight, 56)), 44, 300) + 'px';
      chars.forEach((c) => { c.el.style.removeProperty('--w'); c.el.style.removeProperty('--g'); c.el.style.transition = ''; });
      if (interactive) chars.forEach((c) => { c.el.style.setProperty('--w', c.w.toFixed(1)); c.el.style.setProperty('--g', c.g.toFixed(0)); });
      measureChars();
    }
    let nameBox = null;
    function measureChars() {
      const hr = hero.getBoundingClientRect();
      const nb = name.getBoundingClientRect();
      nameBox = { left: nb.left - hr.left, right: nb.right - hr.left, top: nb.top - hr.top, bottom: nb.bottom - hr.top };
      chars.forEach((c) => {
        const r = c.el.getBoundingClientRect();
        c.cx = r.left - hr.left + r.width / 2; c.cy = r.top - hr.top + r.height / 2;
      });
    }

    let T = null;
    safe('hero-terrain', () => {
      T = makeTerrain($('[data-terrain="hero"]', hero), { seed: 0.0, levels: 30, lensR: fine ? 150 : 110, pan: [0.4, -0.2] });
      T.reveal = reduced ? 1 : 0;
      T.time = reduced ? 40 : 0;
    });
    if (!T) root.classList.add('no-webgl');

    // pointer
    let px = -1, py = -1, inside = false, interactive = false, lastMove = 0;
    hero.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      const r = hero.getBoundingClientRect();
      px = e.clientX - r.left; py = e.clientY - r.top; inside = true; lastMove = performance.now();
      if (T) { T.mouse.tx = px; T.mouse.ty = py; T.mouse.tz = 1; if (T.mouse.z < 0.02) { T.mouse.x = px; T.mouse.y = py; } }
    }, { passive: true });
    hero.addEventListener('pointerleave', () => { inside = false; if (T) T.mouse.tz = 0; readout.classList.remove('is-on'); });

    // intro
    const t0 = performance.now();
    let introDone = reduced;
    const start = () => {
      fitName();
      hero.classList.add('is-live');
      $$('[data-scramble]', hero).forEach((el, i) => setTimeout(() => scramble(el, 900), 700 + i * 180));
      setTimeout(() => { name.classList.add('is-interactive'); interactive = true; measureChars(); }, reduced ? 0 : 2300);
    };
    const fontsReady = d.fonts && d.fonts.ready ? d.fonts.ready : Promise.resolve();
    Promise.race([fontsReady, new Promise((r) => setTimeout(r, 1500))]).then(() => requestAnimationFrame(start));
    onResize.push(fitName);

    const heroH = () => hero.offsetHeight;
    tickers.push((t) => {
      const sy = window.scrollY;
      const hp = clamp(sy / heroH(), 0, 1);
      if (hp < 1) {
        body.style.transform = hp > 0 ? `translate3d(0, ${(hp * heroH() * 0.16).toFixed(1)}px, 0)` : '';
        body.style.opacity = hp > 0 ? (1 - hp * 0.9).toFixed(3) : '';
      }
      if (T) {
        if (!reduced) T.time = t;
        if (!introDone) { const k = clamp((performance.now() - t0 - 150) / 2600, 0, 1); T.reveal = easeOut(k); if (k >= 1) introDone = true; }
        T.fade = 1 - hp * 0.55;
        T.zoom = 1 - hp * 0.14;
        // no mouse (touch, or idle) → the survey lens wanders on its own
        if (!fine || (!inside && performance.now() - lastMove > 2600 && !reduced)) {
          if (!fine && !reduced) {
            T.mouse.tx = T.w * (0.64 + 0.2 * Math.sin(t * 0.21)); T.mouse.ty = T.h * (0.42 + 0.16 * Math.sin(t * 0.33 + 1.2)); T.mouse.tz = 0.9;
          }
        }
        T.easeMouse(fine ? 0.16 : 0.05);
        // live elevation readout
        const nr = nameBox;
        const overName = nr && px > nr.left && px < nr.right && py > nr.top - 30 && py < nr.bottom + 10;
        if (inside && fine && T.mouse.z > 0.3 && !overName) {
          const h = T.sample(px, py) + 0.14 * T.mouse.z;
          const m = 1400 + clamp((h - 0.22) / 0.52, 0, 1) * 7449;
          roElev.textContent = fmt(m);
          const lat = 27.7 + (1 - py / T.h) * 0.36, lon = 85.3 + (px / T.w) * 1.62;
          roCoord.textContent = `${lat.toFixed(4)}°N  ${lon.toFixed(4)}°E`;
          const flip = px > T.w - 210;
          readout.style.transform = `translate3d(${(flip ? px - 190 : px + 22).toFixed(0)}px, ${(py + 22).toFixed(0)}px, 0)`;
          readout.classList.add('is-on');
        } else readout.classList.remove('is-on');
      }
      // variable-font proximity: letters near the cursor swell wider and heavier
      if (interactive && fine && !reduced && hp < 0.6) {
        const sig = Math.max(120, hero.offsetWidth * 0.1);
        chars.forEach((c) => {
          let tw = 100, tg = 800;
          if (inside) {
            const dx = px - c.cx, dy = (py - c.cy) * 1.4;
            const inf = Math.exp(-(dx * dx + dy * dy) / (2 * sig * sig));
            tw = 100 + 30 * inf; tg = 800 + 100 * inf;
          }
          const nw = lerp(c.w, tw, 0.14), ng = lerp(c.g, tg, 0.14);
          if (Math.abs(nw - c.w) > 0.05 || Math.abs(ng - c.g) > 0.3) {
            c.w = nw; c.g = ng;
            c.el.style.setProperty('--w', nw.toFixed(1)); c.el.style.setProperty('--g', ng.toFixed(0));
          }
        });
      }
    });

    // adaptive resolution: if the GPU struggles, render fewer pixels
    if (T && !lockQuality) {
      let acc = 0, n = 0;
      tickers.push((t, dt) => {
        if (!T.visible || document.hidden) return;
        acc += dt; n++;
        if (n === 45) {
          const avg = acc / n; acc = 0; n = 0;
          if (avg > 26 && T.q > 0.5) { T.q = Math.max(0.5, T.q - 0.2); T.resize(); }
        }
      });
    }
  }

  /* ------------------------------------------------------------------
     Reveals, counters, scramble labels
     ------------------------------------------------------------------ */
  function initReveals() {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const el = e.target;
        el.classList.add('is-in');
        if (el.hasAttribute('data-scramble')) scramble(el);
        $$('[data-count]', el).forEach(countUp);
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    $$('[data-reveal]').forEach((el) => io.observe(el));
    $$('.section [data-scramble], .contact [data-scramble]').forEach((el) => io.observe(el));
  }
  function countUp(el) {
    const since = el.dataset.yearsSince;
    const target = since ? new Date().getFullYear() - parseInt(since, 10) : parseFloat(el.dataset.count);
    if (reduced || !isFinite(target)) { el.textContent = target; return; }
    const t0 = performance.now(), dur = 1600;
    const step = (now) => {
      const k = clamp((now - t0) / dur, 0, 1);
      el.textContent = Math.round(target * (1 - Math.pow(2, -10 * k)));
      if (k < 1) requestAnimationFrame(step); else el.textContent = target;
    };
    requestAnimationFrame(step);
  }

  /* ------------------------------------------------------------------
     Statement — words light up as you read down
     ------------------------------------------------------------------ */
  function initWords() {
    const el = $('[data-words]');
    if (!el || reduced) return;
    const walk = d.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walk.nextNode()) nodes.push(walk.currentNode);
    nodes.forEach((n) => {
      const frag = d.createDocumentFragment();
      n.textContent.split(/(\s+)/).forEach((p) => {
        if (!p) return;
        if (/^\s+$/.test(p)) frag.appendChild(d.createTextNode(p));
        else { const s = d.createElement('span'); s.className = 'w'; s.textContent = p; frag.appendChild(s); }
      });
      n.replaceWith(frag);
    });
    const words = $$('.w', el).map((w) => ({ w, o: -1 }));
    tickers.push(() => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      if (r.bottom < -50 || r.top > vh + 50) return;
      const p = clamp((vh * 0.88 - r.top) / (vh * 0.5 + r.height * 0.5), 0, 1);
      const n = words.length;
      words.forEach((x, i) => {
        const o = +(0.16 + 0.84 * clamp(p * (n + 3) - i, 0, 1)).toFixed(2);
        if (o !== x.o) { x.o = o; x.w.style.opacity = o; }
      });
    });
  }

  /* ------------------------------------------------------------------
     02 AGENTS — replays one real governance cycle around the Reviewer gate
     ------------------------------------------------------------------ */
  function initAgents() {
    const svg = $('[data-agents]');
    if (!svg) return;
    const log = $$('[data-agents-log] li');
    const NS = 'http://www.w3.org/2000/svg';
    const el = (tag, attrs, parent) => { const n = d.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };
    const C = { x: 260, y: 214 }, RX = 196, RY = 162;
    const ring = ['CEO', 'Strategist', 'Researcher', 'Builder', 'Growth', 'Comms', 'Legal', 'Investor'];
    const ang = (i) => -Math.PI / 2 + i * Math.PI / 4;
    const at = (a) => ({ x: C.x + Math.cos(a) * RX, y: C.y + Math.sin(a) * RY });
    const pos = {};
    ring.forEach((n, i) => { pos[n] = Object.assign(at(ang(i)), { a: ang(i) }); });
    pos.Reviewer = { x: C.x, y: C.y, a: 0 };

    el('ellipse', { cx: C.x, cy: C.y, rx: RX, ry: RY, class: 'ag-ring' }, svg);
    const spokes = {};
    ring.forEach((n) => { spokes[n] = el('line', { x1: C.x, y1: C.y, x2: pos[n].x, y2: pos[n].y, class: 'ag-edge' }, svg); });
    const nodes = {};
    ring.forEach((n) => {
      const g = el('g', { class: 'ag-node' }, svg);
      el('circle', { cx: pos[n].x, cy: pos[n].y, r: 7 }, g);
      const below = Math.sin(pos[n].a) >= -0.01;
      el('text', { x: pos[n].x, y: pos[n].y + (below ? 23 : -15), 'text-anchor': 'middle' }, g).textContent = n;
      nodes[n] = g;
    });
    const gate = el('g', { class: 'ag-gate ag-node' }, svg);
    el('circle', { cx: C.x, cy: C.y, r: 34, class: 'gate-ring' }, gate);
    el('circle', { cx: C.x, cy: C.y, r: 16, class: 'core' }, gate);
    el('text', { x: C.x, y: C.y + 58, 'text-anchor': 'middle' }, gate).textContent = 'Reviewer';
    nodes.Reviewer = gate;
    const flagB = el('text', { x: C.x, y: C.y - 46, 'text-anchor': 'middle', class: 'ag-flag block' }, svg); flagB.textContent = '✕ BLOCK';
    const flagP = el('text', { x: C.x, y: C.y - 46, 'text-anchor': 'middle', class: 'ag-flag pass' }, svg); flagP.textContent = '✓ PASS';
    const ping = el('circle', { cx: pos.Researcher.x, cy: pos.Researcher.y, r: 0, class: 'ag-ping' }, svg);
    const b = pos.Builder;
    const live = el('g', { class: 'ag-live' }, svg);
    el('rect', { x: b.x - 42, y: b.y + 32, width: 84, height: 20, rx: 2 }, live);
    el('text', { x: b.x, y: b.y + 46, 'text-anchor': 'middle' }, live).textContent = '● LIVE SITE';
    const pk = el('circle', { r: 4.5, class: 'ag-packet', cx: C.x, cy: C.y, opacity: 0 }, svg);
    const amb = [0, 1, 2].map(() => el('circle', { r: 2.6, class: 'ag-packet amb', cx: C.x, cy: C.y }, svg));

    if (reduced) { log.forEach((li) => li.classList.add('is-done')); amb.forEach((c) => c.setAttribute('opacity', 0)); return; }

    const LOOP = 8800;
    const segs = [['Strategist', 'Reviewer', 0, 900], ['Reviewer', 'Strategist', 1500, 2200], ['Reviewer', 'Researcher', 2500, 3200],
      ['Researcher', 'Reviewer', 3800, 4500], ['Reviewer', 'Builder', 5500, 6300]];
    const stepAt = (m) => (m < 900 ? 0 : m < 2500 ? 1 : m < 4600 ? 2 : m < 5500 ? 3 : 4);
    let visible = false, t0 = 0;
    new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting && !visible) t0 = performance.now();
      visible = e.isIntersecting;
    }), { threshold: 0.25 }).observe(svg);

    tickers.push(() => {
      if (!visible) return;
      const m = (performance.now() - t0) % LOOP;
      const hot = new Set();
      const seg = segs.find(([, , st, en]) => m >= st && m < en);
      if (seg) {
        const [a, z, st, en] = seg;
        const k = easeOut((m - st) / (en - st));
        pk.setAttribute('cx', lerp(pos[a].x, pos[z].x, k).toFixed(1));
        pk.setAttribute('cy', lerp(pos[a].y, pos[z].y, k).toFixed(1));
        pk.setAttribute('opacity', 1);
        hot.add(a); hot.add(z);
      } else pk.setAttribute('opacity', 0);
      const block = m >= 900 && m < 2300, pass = m >= 4600 && m < 5500;
      gate.classList.toggle('is-block', block); gate.classList.toggle('is-pass', pass);
      flagB.classList.toggle('is-on', block); flagP.classList.toggle('is-on', pass);
      if (m >= 3200 && m < 3800) {
        const k = (m - 3200) / 600;
        ping.setAttribute('r', (8 + 15 * k).toFixed(1)); ping.setAttribute('opacity', (1 - k).toFixed(2));
        hot.add('Researcher');
      } else ping.setAttribute('r', 0);
      const isLive = m >= 6300 && m < 8500;
      live.classList.toggle('is-on', isLive);
      if (isLive) hot.add('Builder');
      Object.keys(nodes).forEach((n) => nodes[n].classList.toggle('is-hot', hot.has(n)));
      ring.forEach((n) => spokes[n].classList.toggle('is-hot', hot.has(n) && (hot.has('Reviewer') || !!seg)));
      const step = stepAt(m);
      log.forEach((li, i) => { li.classList.toggle('is-active', i === step); li.classList.toggle('is-done', i < step); });
      state.agentsStep = step;
      // background chatter around the ring
      amb.forEach((c, j) => {
        const tt = m + j * 2930, k = (tt % 2600) / 2600, i0 = (j * 3 + Math.floor(tt / 2600)) % 8;
        const p0 = at(ang(i0) + k * Math.PI / 4);
        c.setAttribute('cx', p0.x.toFixed(1)); c.setAttribute('cy', p0.y.toFixed(1));
      });
    });
  }

  /* ------------------------------------------------------------------
     03 THE ASCENT — career as an elevation profile, scrolled sideways
     ------------------------------------------------------------------ */
  function initAscent() {
    const sec = $('[data-ascent]');
    const pin = $('[data-ascent-pin]', sec);
    const sticky = $('.ascent-sticky', sec);
    const track = $('[data-ascent-track]', sec);
    const svg = $('[data-ascent-svg]', sec);
    const list = $('.camps', sec);
    const camps = $$('.camp', sec);
    const hudYear = $('[data-hud-year]'), hudAlt = $('[data-hud-alt]'), hudCamp = $('[data-hud-camp]'), bar = $('[data-ascent-bar]');
    const now = new Date();
    const nowYear = now.getFullYear() + now.getMonth() / 12;
    const starts = camps.map((c) => (c.dataset.at === 'now' ? nowYear : parseFloat(c.dataset.at)));
    const Y0 = 2012, Y1 = 2027.6, A0 = 1400, A1 = 8849;
    const altOf = (y) => A0 + (y - Y0) / (Y1 - Y0) * (A1 - A0);
    const NS = 'http://www.w3.org/2000/svg';
    const el = (tag, attrs, parent) => { const n = d.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };

    let g = null;   // geometry
    const wantH = () => window.innerWidth >= 900 && window.innerHeight >= 560 && !reduced;

    function layout() {
      const horiz = wantH();
      sec.classList.toggle('is-horizontal', horiz);
      state.ascentMode = horiz ? 'horizontal' : 'vertical';
      svg.innerHTML = '';
      if (!horiz) {
        g = null;
        pin.style.height = ''; track.style.width = ''; track.style.transform = '';
        camps.forEach((c) => { c.style.left = ''; c.style.top = ''; c.style.removeProperty('--dy'); c.style.removeProperty('--cw'); });
        return;
      }
      const W = window.innerWidth, H = sticky.clientHeight;
      const gap = clamp(W * 0.3, 380, 480);
      const padL = W * 0.46, padR = W * 0.62;
      const n = camps.length;
      const trackW = padL + (n - 1) * gap + padR;
      const cardW = clamp(W * 0.24, 290, 340);
      track.style.width = trackW + 'px';
      pin.style.height = (trackW - W + H) + 'px';
      svg.setAttribute('width', trackW); svg.setAttribute('height', H);
      svg.setAttribute('viewBox', `0 0 ${trackW} ${H}`);

      const yLow = H * 0.84, yTop = H * 0.14;
      const yOfAlt = (a) => yLow - (a - A0) / (A1 - A0) * (yLow - yTop);
      const altOfY = (y) => A0 + (yLow - y) / (yLow - yTop) * (A1 - A0);
      const cx = starts.map((_, i) => padL + i * gap);
      const cy = starts.map((s) => yOfAlt(altOf(s)));
      const ctrl = [[0, H * 0.93], [padL * 0.55, H * 0.87]]
        .concat(cx.map((x, i) => [x, cy[i]]))
        .concat([[cx[n - 1] + padR * 0.55, yOfAlt(8600)], [trackW, yOfAlt(8849)]]);
      const trend = (x) => {
        let i = 0; while (i < ctrl.length - 2 && x > ctrl[i + 1][0]) i++;
        const [x0, y0] = ctrl[i], [x1, y1] = ctrl[i + 1];
        const t = clamp((x - x0) / (x1 - x0), 0, 1);
        return lerp(y0, y1, (1 - Math.cos(Math.PI * t)) / 2);
      };
      const near = (x) => cx.reduce((m, c) => Math.max(m, Math.exp(-Math.pow((x - c) / 55, 2))), 0);
      // decide card placement first: summits only rise where no card hangs above the ridge
      const topLimit = 170;
      const heights = camps.map((c) => { c.style.setProperty('--cw', cardW + 'px'); return c.firstElementChild.offsetHeight || 260; });
      const above = cy.map((y, i) => y - 44 - heights[i] >= topLimit);
      above.forEach((up, i) => {
        if (!up) return;
        for (let x = cx[i] - 26; x <= cx[i] - 26 + cardW; x += 10) {
          if (trend(x) - 30 < cy[i] - 44 + 12) { if (cy[i] + 44 + heights[i] <= H - 70) above[i] = false; break; }
        }
      });
      const peak = (x) => {
        if (x <= cx[0] || x >= cx[n - 1]) return 0;
        let i = 0; while (i < n - 2 && x > cx[i + 1]) i++;
        const t = (x - cx[i]) / (cx[i + 1] - cx[i]);
        const amp = (above[i] ? 14 : 60) * (0.7 + 0.6 * Math.abs(n1(i * 3.7 + 1.3)));
        return Math.pow(Math.sin(Math.PI * t), 1.6) * amp;
      };
      const pts = [];
      for (let x = 0; x <= trackW + 1; x += 10) {
        const jag = n1(x / 110) * 22 + n1(x / 38 + 3) * 9 + n1(x / 13 + 9) * 3.5;
        pts.push([x, Math.max(H * 0.08, trend(x) + jag * (1 - near(x)) - peak(x))]);
      }
      const lens = [0];
      for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const total = lens[lens.length - 1];
      const poly = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');

      // background ranges (parallax)
      const range = (f, base, amp, seed) => {
        const w = W + (trackW - W) * f + 40, out = [];
        for (let x = -20; x <= w; x += 14) {
          const y = lerp(base[0], base[1], x / w) + (n1(x / 160 + seed) * amp + n1(x / 55 + seed * 2) * amp * 0.35);
          out.push((out.length ? 'L' : 'M') + x.toFixed(0) + ' ' + y.toFixed(1));
        }
        return out.join('') + `L${w.toFixed(0)} ${H + 20}L-20 ${H + 20}Z`;
      };
      // elevation-profile grid: every 1,000 m, visible only in open sky
      for (let a = 2000; a <= 8000; a += 1000) {
        const y = yOfAlt(a);
        el('line', { x1: 0, x2: trackW, y1: y, y2: y, class: 'alt-grid' }, svg);
        for (let x = 24; x < trackW; x += Math.max(W * 0.9, 900)) {
          el('text', { x, y: y - 6, class: 'alt-grid-label' }, svg).textContent = fmt(a) + ' m';
        }
      }
      const far = el('g', {}, svg), mid = el('g', {}, svg);
      el('path', { d: range(0.3, [H * 0.46, H * 0.2], 80, 11), class: 'ridge-far' }, far);
      el('path', { d: range(0.6, [H * 0.7, H * 0.34], 52, 23), class: 'ridge-mid' }, mid);

      // main ridge + hachures
      el('path', { d: poly + `L${trackW} ${H + 20}L0 ${H + 20}Z`, class: 'ridge-main' }, svg);
      const hatch = [];
      for (let i = 2; i < pts.length - 1; i += 2) {
        const [x, y] = pts[i]; const slope = pts[i + 1][1] - pts[i - 1][1];
        const len = 10 + Math.abs(n1(x / 17)) * 16;
        hatch.push(`M${x.toFixed(1)} ${(y + 5).toFixed(1)}l${(-slope * 0.35).toFixed(1)} ${len.toFixed(1)}`);
      }
      el('path', { d: hatch.join(''), class: 'ridge-hatch' }, svg);
      el('path', { d: poly, class: 'ridge-line' }, svg);
      const trail = el('path', { d: poly, class: 'ridge-trail', 'stroke-dasharray': total.toFixed(1), 'stroke-dashoffset': total.toFixed(1) }, svg);

      // camps: flag poles, dots, altitude labels; cards placed where there's room
      const dots = [];
      camps.forEach((c, i) => {
        const ch = heights[i];
        const up = above[i];
        const cardTop = up ? cy[i] - 44 - ch : cy[i] + 44;
        c.style.left = (cx[i] - 26) + 'px';
        c.style.top = cardTop + 'px';
        c.style.setProperty('--dy', up ? '12px' : '-12px');
        el('line', { x1: cx[i], x2: cx[i], y1: up ? cy[i] - 8 : cy[i] + 8, y2: up ? cardTop + ch : cardTop, class: 'camp-pole' }, svg);
        dots.push(el('circle', { cx: cx[i], cy: cy[i], r: 6, class: 'camp-dot' }, svg));
        const label = el('text', { x: cx[i] - 12, y: cy[i] - 12, class: 'camp-alt', 'text-anchor': 'end' }, svg);
        label.textContent = '▲ ' + fmt(altOf(starts[i])) + ' m';
      });
      const still = el('text', { x: trackW - padR * 0.42, y: yOfAlt(8849) + 40, class: 'still', 'text-anchor': 'middle' }, svg);
      still.textContent = 'Still climbing →';
      const halo = el('circle', { r: 16, class: 'climber-halo' }, svg);
      const climber = el('circle', { r: 5, class: 'climber' }, svg);

      g = { W, H, trackW, pts, lens, total, trail, far, mid, cx, dots, halo, climber, altOfY, headK: 0.44 };
      update();
    }

    function pointAt(x) {
      const i = clamp(Math.floor(x / 10), 0, g.pts.length - 2);
      const t = clamp((x - g.pts[i][0]) / 10, 0, 1);
      return { y: lerp(g.pts[i][1], g.pts[i + 1][1], t), len: lerp(g.lens[i], g.lens[i + 1], t) };
    }

    let last = -1;
    function update() {
      if (!g) {
        // vertical: rail fills as you read
        const r = list.getBoundingClientRect(), vh = window.innerHeight;
        if (r.bottom < 0 || r.top > vh) return;
        const p = clamp((vh * 0.6 - r.top) / r.height, 0, 1);
        list.style.setProperty('--p', p.toFixed(4));
        camps.forEach((c) => c.classList.toggle('is-reached', c.getBoundingClientRect().top < vh * 0.62));
        return;
      }
      const r = pin.getBoundingClientRect();
      const dist = pin.offsetHeight - g.H;
      const p = clamp(-r.top / dist, 0, 1);
      if (p === last) return;
      last = p;
      const x = p * (g.trackW - g.W);
      track.style.transform = `translate3d(${(-x).toFixed(1)}px,0,0)`;
      g.far.setAttribute('transform', `translate(${(x * 0.7).toFixed(1)} 0)`);
      g.mid.setAttribute('transform', `translate(${(x * 0.4).toFixed(1)} 0)`);
      const head = x + g.W * g.headK;
      const pt = pointAt(head);
      g.trail.setAttribute('stroke-dashoffset', (g.total - pt.len).toFixed(1));
      g.climber.setAttribute('cx', head.toFixed(1)); g.climber.setAttribute('cy', pt.y.toFixed(1));
      g.halo.setAttribute('cx', head.toFixed(1)); g.halo.setAttribute('cy', pt.y.toFixed(1));
      let cur = 0;
      g.cx.forEach((c, i) => {
        const reached = head >= c - 2;
        camps[i].classList.toggle('is-reached', reached);
        g.dots[i].classList.toggle('is-reached', reached);
        if (reached) cur = i;
      });
      camps.forEach((c, i) => c.classList.toggle('is-current', i === cur && head >= g.cx[0] - 2));
      let yr;
      if (head < g.cx[0]) yr = '2012';
      else if (head >= g.cx[g.cx.length - 1]) yr = 'Now';
      else {
        const i = g.cx.findIndex((c, k) => head >= c && head < g.cx[k + 1]);
        yr = String(Math.floor(lerp(starts[i], starts[i + 1], (head - g.cx[i]) / (g.cx[i + 1] - g.cx[i]))));
      }
      hudYear.textContent = yr;
      hudAlt.textContent = fmt(clamp(g.altOfY(pt.y), 1300, 8849));
      hudCamp.textContent = String(cur + 1).padStart(2, '0');
      bar.style.transform = `scaleX(${p.toFixed(4)})`;
    }

    layout();
    onResize.push(layout);
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(layout);
    tickers.push(update);
  }

  /* ------------------------------------------------------------------
     04 WORK — cursor-following survey tile + filterable private work
     ------------------------------------------------------------------ */
  function initWork() {
    if (!fine) return;
    const prev = $('[data-preview]');
    const list = $('[data-work-list]');
    const domEl = $('[data-preview-domain]'), stEl = $('[data-preview-status]');
    const rows = $$('.work-row');
    let T = null;
    safe('preview-terrain', () => {
      T = makeTerrain($('canvas', prev), { levels: 15, lens: 0, zoom: 0.75, maxDpr: 2 });
      visibility.unobserve(T.c);   // fixed-position: IO always says "visible"; we drive it ourselves
      T.visible = false;
      const io = new IntersectionObserver((es) => {
        if (!es.some((e) => e.isIntersecting)) return;
        rows.forEach((r) => T.texture(r.dataset.shot).catch(() => {}));
        io.disconnect();
      }, { rootMargin: '600px 0px' });
      io.observe(list);
    });
    let on = false, x = 0, y = 0, tx = 0, ty = 0, seedT0 = 0, offUntil = 0, cur = null;
    const placeFor = (a) => {
      const rr = a.getBoundingClientRect();
      return { x: rr.right - 48 - prev.offsetWidth, y: rr.top + 8, h: Math.max(72, rr.height - 16) };
    };
    rows.forEach((row) => {
      const a = $('a', row);
      a.addEventListener('pointerenter', () => {
        if (window.innerWidth < 1181) return;
        cur = row;
        const hh = placeFor(a).h;
        if (Math.abs(prev.offsetHeight - hh) > 1) { prev.style.height = hh + 'px'; if (T) T.resize(); }
        domEl.textContent = row.dataset.domain;
        stEl.textContent = row.dataset.status || '';
        if (T) {
          T.o.seed = parseFloat(row.dataset.seed); seedT0 = performance.now(); T.reveal = 0; T.curTex = null;
          T.texture(row.dataset.shot).then((tex) => { if (cur === row) { T.curTex = tex; state.previewTex = row.dataset.domain; } }).catch(() => {});
        }
        if (!on && performance.now() > offUntil) { const pl = placeFor(a); x = tx = pl.x; y = ty = pl.y; }
        on = true; prev.classList.add('is-on');
      });
      a.addEventListener('pointerleave', () => { on = false; offUntil = performance.now() + 250; prev.classList.remove('is-on'); });
    });
    window.addEventListener('scroll', () => { if (on) { on = false; prev.classList.remove('is-on'); } }, { passive: true });
    tickers.push((t) => {
      if (!on && performance.now() > offUntil + 700) { if (T) T.visible = false; return; }
      if (cur) { const pl = placeFor($('a', cur)); tx = pl.x; ty = pl.y; }
      x = lerp(x, tx, 0.25); y = lerp(y, ty, 0.22);
      prev.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      if (T) {
        T.time = t * 0.6;
        T.reveal = easeOut(clamp((performance.now() - seedT0) / 700, 0, 1));
        T.visible = true;
      }
    });
  }

  function initFilters() {
    const btns = $$('[data-filter]');
    const grid = $('[data-offmap]');
    if (!grid) return;
    const cards = $$('.om-card', grid);
    const live = d.createElement('p');
    live.className = 'sr-only'; live.setAttribute('aria-live', 'polite');
    grid.after(live);
    btns.forEach((b) => b.addEventListener('click', () => {
      const f = b.dataset.filter;
      btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      const first = new Map(cards.map((c) => [c, c.classList.contains('is-hidden') ? null : c.getBoundingClientRect()]));
      cards.forEach((c) => c.classList.toggle('is-hidden', !(f === 'all' || c.dataset.cat === f)));
      const shown = cards.filter((c) => !c.classList.contains('is-hidden'));
      live.textContent = `Showing ${shown.length} project${shown.length === 1 ? '' : 's'}`;
      if (reduced || !cards[0].animate) return;
      shown.forEach((c, i) => {
        const a = first.get(c), bR = c.getBoundingClientRect();
        if (!a) {
          c.animate([{ opacity: 0, transform: 'translateY(18px) scale(.97)' }, { opacity: 1, transform: 'none' }],
            { duration: 620, delay: i * 35, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' });
        } else {
          const dx = a.left - bR.left, dy = a.top - bR.top;
          if (dx || dy) c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 700, easing: 'cubic-bezier(.16,1,.3,1)' });
        }
      });
    }));
  }

  /* ------------------------------------------------------------------
     05 STRATA — wavy geological layers with map-legend rock patterns
     ------------------------------------------------------------------ */
  function initStrata() {
    const wrap = $('[data-strata]');
    if (!wrap) return;
    const NS = 'http://www.w3.org/2000/svg';
    const layers = $$('.stratum', wrap);
    const defs = d.createElementNS(NS, 'svg');
    defs.setAttribute('width', '0'); defs.setAttribute('height', '0'); defs.setAttribute('aria-hidden', 'true');
    defs.style.position = 'absolute';
    defs.innerHTML = `<defs>
      <pattern id="pat-sky" width="46" height="30" patternUnits="userSpaceOnUse"><circle cx="8" cy="8" r="1.7" fill="none" stroke="var(--ink)"/><circle cx="31" cy="21" r=".9" fill="var(--ink)"/></pattern>
      <pattern id="pat-air" width="64" height="26" patternUnits="userSpaceOnUse"><path d="M4 8h14M36 20h10M50 6h6" stroke="var(--ink)" stroke-width="1" stroke-linecap="round"/></pattern>
      <pattern id="pat-dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.1" fill="var(--ink)"/><circle cx="10" cy="10" r=".8" fill="var(--ink)"/></pattern>
      <pattern id="pat-dash" width="28" height="12" patternUnits="userSpaceOnUse"><path d="M2 3h10M16 9h10" stroke="var(--ink)" stroke-width="1.1"/></pattern>
      <pattern id="pat-brick" width="36" height="18" patternUnits="userSpaceOnUse"><path d="M0 .5h36M0 9.5h36M.5 0v9M18.5 9v9" stroke="var(--ink)" stroke-width="1" fill="none"/></pattern>
      <pattern id="pat-cross" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M5 2v6M2 5h6M15 12v6M12 15h6" stroke="var(--ink)" stroke-width="1"/></pattern>
    </defs>`;
    d.body.appendChild(defs);
    wrap.classList.add('has-strata-art');

    function draw() {
      layers.forEach((L, i) => {
        let svg = $('.s-art', L);
        if (!svg) { svg = d.createElementNS(NS, 'svg'); svg.setAttribute('class', 's-art'); svg.setAttribute('aria-hidden', 'true'); L.prepend(svg); }
        const w = L.offsetWidth, h = L.offsetHeight;
        const amp = i === 0 ? 0 : 10 + i * 3, lift = i === 0 ? 0 : amp + 4;
        const ext = i < layers.length - 1 ? 10 + (i + 1) * 3 + 6 : 0;
        const H = h + lift + ext;
        svg.setAttribute('viewBox', `0 0 ${w} ${H}`);
        svg.setAttribute('height', H); svg.style.height = H + 'px'; svg.style.top = -lift + 'px';
        let top = '';
        for (let x = 0; x <= w + 12; x += 12) {
          const y = lift + (n1(x / 240 + i * 13.7) * 0.8 + n1(x / 70 + i * 5.1) * 0.2) * amp;
          top += (top ? 'L' : 'M') + x + ' ' + y.toFixed(1);
        }
        const shape = top + `L${w + 12} ${H}L0 ${H}Z`;
        const pat = L.dataset.pattern;
        svg.innerHTML = `<path class="s-fill" d="${shape}" style="fill:var(--s${i})"/>` +
          `<path class="s-pat" d="${shape}" fill="url(#pat-${pat})"/>` +
          (i ? `<path class="s-edge" d="${top}"/>` : '');
      });
    }
    draw();
    onResize.push(draw);
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(draw);
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { wrap.classList.add('is-in'); io.disconnect(); } }), { threshold: 0.18 });
    io.observe(wrap);
  }

  /* ------------------------------------------------------------------
     CONTACT terrain (quiet, responds to the cursor)
     ------------------------------------------------------------------ */
  function initContact() {
    const sec = $('.contact');
    const T = makeTerrain($('[data-terrain="contact"]', sec), { seed: 9.3, levels: 24, zoom: 1.15, lensR: 130, alpha: 0.85, pan: [3.1, 1.7] });
    if (reduced) T.time = 12;
    sec.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = sec.getBoundingClientRect();
      T.mouse.tx = e.clientX - r.left; T.mouse.ty = e.clientY - r.top; T.mouse.tz = 1;
      if (T.mouse.z < 0.02) { T.mouse.x = T.mouse.tx; T.mouse.y = T.mouse.ty; }
    }, { passive: true });
    sec.addEventListener('pointerleave', () => { T.mouse.tz = 0; });
    tickers.push((t) => { if (!reduced) T.time = t * 0.8; T.easeMouse(0.12); });
  }

  /* ------------------------------------------------------------------
     NAV, menu, theme, clock, altimeter, copy, magnetic
     ------------------------------------------------------------------ */
  function initNav() {
    const nav = $('#nav');
    let lastY = window.scrollY;
    tickers.push(() => {
      const y = window.scrollY;
      nav.classList.toggle('is-scrolled', y > 30);
      const menuOpen = root.classList.contains('menu-open');
      if (!menuOpen && Math.abs(y - lastY) > 4) {
        nav.classList.toggle('is-hidden', y > lastY && y > window.innerHeight * 0.8);
        lastY = y;
      }
    });
    nav.addEventListener('focusin', () => nav.classList.remove('is-hidden'));
    const links = $$('.nav-links a');
    const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      const a = map.get(e.target.id);
      if (a && e.isIntersecting) { links.forEach((l) => l.removeAttribute('aria-current')); a.setAttribute('aria-current', 'true'); }
      else if (a && !e.isIntersecting) a.removeAttribute('aria-current');
    }), { rootMargin: '-45% 0px -50% 0px' });
    map.forEach((_, id) => { const s = d.getElementById(id); if (s) io.observe(s); });
  }

  function initMenu() {
    const btn = $('[data-menu-btn]'), menu = $('[data-menu]');
    const close = (focusBtn) => {
      btn.setAttribute('aria-expanded', 'false');
      menu.classList.remove('is-open'); root.classList.remove('menu-open');
      root.style.overflow = '';
      setTimeout(() => { if (!menu.classList.contains('is-open')) menu.hidden = true; }, reduced ? 0 : 700);
      if (focusBtn) btn.focus();
    };
    const open = () => {
      menu.hidden = false; root.classList.add('menu-open'); root.style.overflow = 'hidden';
      btn.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('is-open')));
      setTimeout(() => { const f = $('a', menu); if (f) f.focus({ preventScroll: true }); }, 120);
    };
    btn.addEventListener('click', () => (btn.getAttribute('aria-expanded') === 'true' ? close(false) : open()));
    $$('a', menu).forEach((a) => a.addEventListener('click', () => close(false)));
    d.addEventListener('keydown', (e) => { if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') close(true); });
    window.addEventListener('resize', () => { if (window.innerWidth > 960 && btn.getAttribute('aria-expanded') === 'true') close(false); });
  }

  function initTheme() {
    const btn = $('[data-theme-toggle]'), label = $('[data-theme-label]');
    const meta = $('meta[name="theme-color"]');
    const sync = () => {
      const day = root.dataset.theme === 'day';
      label.textContent = day ? 'Day' : 'Night';
      btn.setAttribute('aria-label', day ? 'Switch to night theme' : 'Switch to day theme');
      btn.setAttribute('aria-pressed', String(day));
      if (meta) meta.setAttribute('content', cssVar('--bg'));
    };
    const apply = (next) => {
      root.dataset.theme = next;
      try { localStorage.setItem('sm-theme', next); } catch (e) { /* private mode */ }
      sync();
      const pal = readPalette();
      terrains.forEach((t) => { t.setPalette(pal); t.render(); });
    };
    btn.addEventListener('click', () => {
      const next = root.dataset.theme === 'day' ? 'night' : 'day';
      if (!d.startViewTransition || reduced) { apply(next); return; }
      const r = btn.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const rad = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      const vt = d.startViewTransition(() => apply(next));
      vt.ready.then(() => {
        root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${rad}px at ${x}px ${y}px)`] },
          { duration: 950, easing: 'cubic-bezier(.65,0,.35,1)', pseudoElement: '::view-transition-new(root)' });
      }).catch(() => {});
    });
    sync();
  }

  function initClock() {
    const short = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit', hour12: false });
    const long = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kathmandu', hour: 'numeric', minute: '2-digit' });
    const a = $$('[data-clock]'), b = $$('[data-clock-long]');
    const tick = () => { const now = new Date(); a.forEach((e) => { e.textContent = short.format(now); }); b.forEach((e) => { e.textContent = long.format(now); }); };
    tick(); setInterval(tick, 15000);
    $$('[data-year]').forEach((e) => { e.textContent = new Date().getFullYear(); });
  }

  function initAltimeter() {
    const alt = $('[data-altimeter]');
    if (!alt) return;
    const fill = $('[data-alt-fill]'), pip = $('[data-alt-pip]'), val = $('[data-alt-value]'), scale = $('.alt-scale', alt);
    const pin = $('[data-ascent-pin]');
    let last = -1;
    tickers.push(() => {
      const max = d.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
      const pr = pin ? pin.getBoundingClientRect() : null;
      const inAscent = pr && state.ascentMode === 'horizontal' && pr.top < window.innerHeight * 0.5 && pr.bottom > window.innerHeight * 0.5;
      alt.classList.toggle('is-on', window.scrollY > window.innerHeight * 0.6 && !inAscent);
      if (Math.abs(p - last) < 0.0005) return;
      last = p;
      fill.style.transform = `scaleY(${p.toFixed(4)})`;
      pip.style.transform = `translateY(calc(50% - ${(p * scale.offsetHeight).toFixed(1)}px))`;
      val.textContent = fmt(1400 + p * 7449);
    });
  }

  function initCopy() {
    const btn = $('[data-copy]');
    if (!btn) return;
    const label = $('[data-copy-label]', btn);
    btn.setAttribute('aria-live', 'polite');
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy;
      let ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
        const ta = d.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        d.body.appendChild(ta); ta.select();
        try { ok = d.execCommand('copy'); } catch (err) { ok = false; }
        ta.remove();
      }
      label.textContent = ok ? 'Copied ✓' : 'Press Ctrl+C';
      btn.classList.toggle('is-done', ok);
      clearTimeout(btn.__t);
      btn.__t = setTimeout(() => { label.textContent = 'Copy address'; btn.classList.remove('is-done'); }, 2200);
    });
  }

  function initMagnetic() {
    if (!fine || reduced) return;
    $$('.magnetic').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        el.style.setProperty('--mx', (dx * 0.18).toFixed(1) + 'px');
        el.style.setProperty('--my', (dy * 0.3).toFixed(1) + 'px');
      });
      el.addEventListener('pointerleave', () => { el.style.setProperty('--mx', '0px'); el.style.setProperty('--my', '0px'); });
    });
  }

  /* ------------------------------------------------------------------
     BOOT
     ------------------------------------------------------------------ */
  safe('hero', initHero);
  safe('reveals', initReveals);
  safe('words', initWords);
  safe('agents', initAgents);
  safe('ascent', initAscent);
  safe('work', initWork);
  safe('filters', initFilters);
  safe('strata', initStrata);
  safe('contact', initContact);
  safe('nav', initNav);
  safe('menu', initMenu);
  safe('theme', initTheme);
  safe('clock', initClock);
  safe('altimeter', initAltimeter);
  safe('copy', initCopy);
  safe('magnetic', initMagnetic);
  if (!state.webgl) root.classList.add('no-webgl');

  root.classList.add('ready');
  clearTimeout(window.__smFailsafe);

  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      terrains.forEach((t) => t.resize());
      onResize.forEach((fn) => safe('resize', fn));
    }, 140);
  });

  let prev = performance.now();
  const frame = (now) => {
    requestAnimationFrame(frame);
    const dt = Math.min(100, now - prev); prev = now;
    const t = now / 1000;
    for (const fn of tickers) { try { fn(t, dt); } catch (e) { /* keep the loop alive */ } }
    if (!document.hidden) terrains.forEach((T) => { if (T.visible) T.render(); });
    state.frames++;
  };
  requestAnimationFrame(frame);
})();
