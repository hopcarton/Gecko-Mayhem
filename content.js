(function () {
  if (window.__hupunaZenBoxInjected) return;
  window.__hupunaZenBoxInjected = true;

  const boxes = [];
  const gravity = 0.6, bounce = 0.35, friction = 0.99, sleepEps = 0.15;
  window.__hupunaBoxes = boxes;
  let car = null;
  Object.defineProperty(window, '__hupunaCar', { get: () => car, configurable: true });
  let __frameId = null;
  const __timers = [];

  function __cleanupAll() {
    try {
      if (__frameId) cancelAnimationFrame(__frameId);
      while (__timers.length) clearTimeout(__timers.pop());
      if (car && car.el) car.el.remove();
      car = null;
      for (const b of boxes) {
        if (b.onMove) window.removeEventListener('mousemove', b.onMove);
        if (b.onUp) window.removeEventListener('mouseup', b.onUp);
        b.el && b.el.remove();
      }
      boxes.length = 0;
      window.__hupunaZenBoxInjected = false;
    } catch (_) { }
  }
  Object.defineProperty(window, '__hupunaCleanup', { value: __cleanupAll, configurable: true });

  let spriteUrl = null, spriteReady = false;
  (function resolveSprite() {
    try {
      const url = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
        ? chrome.runtime.getURL('shit.gif') : null;
      if (!url) return;
      const img = new Image();
      img.onload = () => { spriteUrl = url; spriteReady = true; refreshAllSprites(); };
      img.onerror = () => { };
      img.src = url;
    } catch (_) { }
  })();

  function refreshAllSprites() {
    if (!spriteReady || !spriteUrl) return;
    const list = window.__hupunaBoxes || [];
    for (const b of list) {
      if (b.img && b.img.src !== spriteUrl) b.img.src = spriteUrl;
    }
  }

  const SETTINGS = {
    enabled: true,
    carSpeedMin: 1,
    carSpeedMax: 3,
    dropBatchMin: 1,
    dropBatchMax: 3,
    dropChanceFast: 0.10,
    boxGravityMin: 0.6,
    boxGravityMax: 1.4
  };

  function spawnBoxAt(x, y, w, h, level) {
    const wrap = document.createElement('div');
    wrap.style.cssText = `position:fixed;left:${x - w / 2}px;top:${y - h / 2}px;width:${w}px;height:${h}px;z-index:2147483647;pointer-events:auto;display:flex;align-items:center;justify-content:center;user-select:none`;
    const img = document.createElement('img');
    if (spriteReady && spriteUrl) img.src = spriteUrl;
    img.alt = 'carton';
    img.style.cssText = 'width:100%;height:100%';
    img.draggable = false;
    wrap.appendChild(img);
    document.documentElement.appendChild(wrap);
    const gScaleRand = SETTINGS.boxGravityMin + Math.random() * (SETTINGS.boxGravityMax - SETTINGS.boxGravityMin);
    const state = { el: wrap, img, x: x - w / 2, y: y - h / 2, w, h, vx: 0, vy: (Math.random() * 2 - 1), dragging: false, lastMouse: null, level: level ?? levelFromSize(w, h), gScale: gScaleRand };
    attachDrag(state);
    boxes.push(state);
    if (!spriteReady) {
      const check = setInterval(() => {
        if (spriteReady && spriteUrl) {
          state.img.src = spriteUrl;
          clearInterval(check);
        }
      }, 100);
      setTimeout(() => clearInterval(check), 5000);
    }
    return state;
  }

  function attachDrag(box) {
    box.el.addEventListener('mousedown', (e) => {
      box.dragging = true;
      box.lastMouse = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    });
    box.onMove = (e) => {
      if (!box.dragging) return;
      const dx = e.clientX - box.lastMouse.x;
      const dy = e.clientY - box.lastMouse.y;
      box.x += dx; box.y += dy;
      box.vx = dx; box.vy = dy;
      box.lastMouse = { x: e.clientX, y: e.clientY };
      updateEl(box);
    };
    window.addEventListener('mousemove', box.onMove);
    box.onUp = () => {
      const speed = Math.hypot(box.vx, box.vy);
      if (box.dragging && speed > 6) {
        box.thrownUntil = performance.now() + 600;
      }
      box.dragging = false;
    };
    window.addEventListener('mouseup', box.onUp);
  }

  function updateEl(box) {
    box.el.style.left = Math.round(box.x) + 'px';
    box.el.style.top = Math.round(box.y) + 'px';
  }

  function step() {
    const W = window.innerWidth, H = window.innerHeight;
    updateCar();
    for (const b of boxes) {
      if (b.thrownUntil && performance.now() >= b.thrownUntil) b.thrownUntil = null;
      if (b.dragging || b.el.style.pointerEvents === 'none') continue;
      b.vy += gravity * (b.gScale || 1);
      b.vx *= friction; b.vy *= friction;
      b.x += b.vx; b.y += b.vy;
      if (b.x < 0) { b.x = 0; b.vx = -b.vx * bounce; }
      if (b.x + b.w > W) { b.x = W - b.w; b.vx = -b.vx * bounce; }
      if (b.y + b.h > H) { b.y = H - b.h; b.vy = -Math.abs(b.vy) * bounce; }
      if (b.y < 0) { b.y = 0; b.vy = Math.abs(b.vy) * bounce; }
      if (Math.abs(b.vx) < sleepEps) b.vx = 0;
      if (Math.abs(b.vy) < sleepEps) b.vy = 0;
      updateEl(b);
    }

    if (car) {
      const carRect = { x: car.x, y: car.y, w: car.w, h: car.h };
      for (let i = boxes.length - 1; i >= 0; i--) {
        const b = boxes[i];
        const thrown = b.thrownUntil && performance.now() < b.thrownUntil;
        if (!(b.dragging || thrown)) continue;
        if (b.el.style.pointerEvents === 'none') continue;
        if (b.x < carRect.x + carRect.w && b.x + b.w > carRect.x && b.y < carRect.y + carRect.h && b.y + b.h > carRect.y) {
          const targetX = carRect.x + carRect.w * 0.65 - b.w / 2;
          const targetY = carRect.y + carRect.h * 0.4 - b.h / 2;
          const startX = b.x, startY = b.y, startW = b.w, startH = b.h;
          const duration = 220, t0 = performance.now();
          b.dragging = false;
          b.el.style.pointerEvents = 'none';
          function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
          function anim(now) {
            const t = Math.min(1, (now - t0) / duration);
            const e = easeOut(t);
            b.x = startX + (targetX - startX) * e;
            b.y = startY + (targetY - startY) * e;
            const scale = 1 - 0.7 * e;
            b.w = startW * scale; b.h = startH * scale;
            b.el.style.width = Math.max(6, Math.round(b.w)) + 'px';
            b.el.style.height = Math.max(6, Math.round(b.h)) + 'px';
            updateEl(b);
            if (t < 1) requestAnimationFrame(anim); else {
              b.el.remove(); boxes.splice(i, 1);
            }
          }
          requestAnimationFrame(anim);
        }
      }
    }

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const axc = a.x + a.w / 2, ayc = a.y + a.h / 2;
        const bxc = b.x + b.w / 2, byc = b.y + b.h / 2;
        const dx = axc - bxc, dy = ayc - byc;
        const overlapX = a.w / 2 + b.w / 2 - Math.abs(dx);
        const overlapY = a.h / 2 + b.h / 2 - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          if (overlapX < overlapY) {
            const push = dx < 0 ? -overlapX : overlapX;
            if (a.dragging && !b.dragging) {
              b.x += push; b.vx = a.vx;
            } else if (!a.dragging && b.dragging) {
              a.x -= push; a.vx = b.vx;
            } else {
              a.x += push / 2; b.x -= push / 2;
              const temp = a.vx; a.vx = b.vx; b.vx = temp;
            }
          } else {
            const push = dy < 0 ? -overlapY : overlapY;
            if (a.dragging && !b.dragging) {
              b.y += push; b.vy = a.vy;
            } else if (!a.dragging && b.dragging) {
              a.y -= push; a.vy = b.vy;
            } else {
              a.y += push / 2; b.y -= push / 2;
              const temp = a.vy; a.vy = b.vy; b.vy = temp;
            }
            a.vy *= bounce; b.vy *= bounce;
          }
          updateEl(a); updateEl(b);
        }
      }
    }
    __frameId = requestAnimationFrame(step);
  }
  __frameId = requestAnimationFrame(step);

  const SIZE_LEVELS = [
    { l: 15, w: 15, h: 15, px: 24 },
    { l: 18, w: 18, h: 18, px: 26 },
    { l: 20, w: 20, h: 20, px: 28 },
    { l: 22, w: 22, h: 22, px: 30 },
    { l: 25, w: 25, h: 25, px: 32 },
    { l: 28, w: 28, h: 28, px: 34 },
    { l: 32, w: 32, h: 32, px: 38 },
    { l: 36, w: 36, h: 36, px: 42 },
    { l: 40, w: 40, h: 40, px: 46 },
    { l: 45, w: 45, h: 45, px: 50 }
  ];

  function levelFromSize(w, h) {
    return SIZE_LEVELS.findIndex(s => s.px === w && s.px === h);
  }

  let carUrl = null, carReady = false;
  (function resolveCar() {
    try {
      const url = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
        ? chrome.runtime.getURL('gecko.gif') : null;
      if (!url) return;
      const img = new Image();
      img.onload = () => { carUrl = url; carReady = true; createCar(); };
      img.onerror = () => { };
      img.src = url;
    } catch (_) { }
  })();

  function createCar() {
    if (!carReady || car) return;
    const w = 100, h = 60;
    const wrap = document.createElement('div');
    wrap.style.cssText = `position:fixed;left:0;width:${w}px;height:${h}px;z-index:2147483646;pointer-events:none;display:flex;align-items:center;justify-content:center`;
    const img = document.createElement('img');
    img.src = carUrl;
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;transform-origin:50% 50%';
    wrap.appendChild(img);
    document.documentElement.appendChild(wrap);
    car = { el: wrap, img, x: -w, y: 0, w, h, vx: 0, active: true, lane: 0, dropPlan: [], dropIdx: 0 };
    startNewPassFromLeft();
  }

  function updateCar() {
    if (!car || !car.active) return;
    const W = window.innerWidth;
    car.x += car.vx;
    car.el.style.left = Math.round(car.x) + 'px';
    car.el.style.top = car.lane + 'px';
    car.y = car.lane;
    handleCarDrops(W);
    if (car.vx > 0 && car.x + car.w >= W && !car.exiting) {
      if (Math.random() < 0.2) {
        startTurnBackPassFromRight();
      } else {
        car.exiting = true;
        car.exitDecision = 'right';
      }
    }
    if (car.vx > 0 && car.exiting && car.exitDecision === 'right' && car.x > W) {
      exitScreenRightThenReenter();
      car.exiting = false;
      car.exitDecision = null;
    }
    if (car.vx < 0 && car.x <= -car.w) exitScreenLeftThenReenter();
    car.img.style.transform = car.vx >= 0 ? 'scaleX(1)' : 'scaleX(-1)';
  }

  function newDropPlanForWidth(W) {
    const count = 6 + Math.floor(Math.random() * 7);
    const marks = [];
    for (let i = 0; i < count; i++) marks.push(0.2 + Math.random() * 0.7);
    marks.sort((a, b) => a - b);
    return marks.map(r => r * W);
  }

  function handleCarDrops(W) {
    if (!car.dropPlan || car.dropIdx >= car.dropPlan.length) return;
    const centerX = car.x + car.w * 0.5;
    while (car.dropIdx < car.dropPlan.length && centerX >= car.dropPlan[car.dropIdx]) {
      dropFromCar();
      car.dropIdx += 1;
    }
  }

  function dropFromCar() {
    const levelChoices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const lvl = levelChoices[Math.floor(Math.random() * levelChoices.length)];
    const s = SIZE_LEVELS[lvl];
    const w = s.px, h = s.px;
    const jitterX = (Math.random() - 0.5) * car.w * 0.4;
    const x = car.x + car.w * 0.2 + jitterX;
    const y = car.y + car.h * 0.6;
    const b = spawnBoxAt(x, y, w, h, lvl);
    b.vx += (Math.random() - 0.5) * 2;
  }

  function startNewPassFromLeft() {
    const W = window.innerWidth;
    const topOrBottom = Math.random() < 0.5;
    const laneTop = Math.max(10, Math.floor(Math.random() * (window.innerHeight * 0.35)));
    const laneBottom = Math.max(20, window.innerHeight - 80 - 20);
    car.lane = topOrBottom ? laneTop : laneBottom;
    car.x = -car.w;
    car.vx = SETTINGS.carSpeedMin + Math.random() * (SETTINGS.carSpeedMax - SETTINGS.carSpeedMin);
    car.dropPlan = newDropPlanForWidth(W);
    car.dropIdx = 0;
    car.exiting = false;
    car.exitDecision = null;
  }

  function startTurnBackPassFromRight() {
    const W = window.innerWidth;
    car.vx = -(SETTINGS.carSpeedMin + Math.random() * (SETTINGS.carSpeedMax - SETTINGS.carSpeedMin));
    car.dropPlan = newDropPlanForWidth(W).map(x => W - x).sort((a, b) => a - b);
    car.dropIdx = 0;
  }

  function exitScreenRightThenReenter() {
    car.active = false;
    const delay = 5000 + Math.random() * 2000;
    __timers.push(setTimeout(() => { car.active = true; startNewPassFromLeft(); }, delay));
  }

  function exitScreenLeftThenReenter() {
    car.active = false;
    const delay = 5000 + Math.random() * 2000;
    __timers.push(setTimeout(() => { car.active = true; startNewPassFromLeft(); }, delay));
  }
})();
