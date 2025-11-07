// Hupuna Box Finder - Content Script

(function () {
  if (window.__hupunaZenBoxInjected) return;
  window.__hupunaZenBoxInjected = true;

  // Trạng thái vật lý cốt lõi
  const boxes = [];
  // Hằng số vật lý cơ bản
  const gravity = 0.6;   // gia tốc rơi chuẩn
  const bounce = 0.35;   // độ nảy khi chạm tường/sàn
  const friction = 0.99; // ma sát không khí đơn giản
  const sleepEps = 0.15; // ngưỡng đưa vận tốc về 0 để ổn định

  // Xuất biến ra window để các callback đến muộn vẫn truy cập được
  window.__hupunaBoxes = boxes;

  // Con trỏ xe cũng khai báo sớm để tránh lỗi TDZ
  let car = null; // {el, img, x, y, w, h, vx, active, lane}
  // Xuất con trỏ xe ra window để background.js có thể cleanup
  Object.defineProperty(window, '__hupunaCar', { get: () => car, configurable: true });

  // Theo dõi frame và timer để cleanup gọn
  let __frameId = null;
  const __timers = [];

  // Hàm cleanup: gỡ toàn bộ dấu tích của game khỏi trang
  function __cleanupAll() {
    try {
      if (__frameId) cancelAnimationFrame(__frameId);
      while (__timers.length) clearTimeout(__timers.pop());
      // gỡ xe
      if (car && car.el) car.el.remove();
      car = null;
      // gỡ hộp + bỏ đăng ký listener
      for (const b of boxes) {
        if (b.onMove) window.removeEventListener('mousemove', b.onMove);
        if (b.onUp) window.removeEventListener('mouseup', b.onUp);
        b.el && b.el.remove();
      }
      boxes.length = 0;
      window.__hupunaZenBoxInjected = false;
    } catch (_) {}
  }
  // Xuất hàm cleanup cho background gọi
  Object.defineProperty(window, '__hupunaCleanup', { value: __cleanupAll, configurable: true });

  // Tải ảnh thùng carton (ship.png) qua web_accessible_resources
  let spriteUrl = null;
  let spriteReady = false;
  (function resolveSprite() {
    try {
      const url = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
        ? chrome.runtime.getURL('ship.png')
        : null;
      if (!url) return;
      const img = new Image();
      img.onload = () => { spriteUrl = url; spriteReady = true; refreshAllSprites(); };
      img.onerror = () => { /* giữ nguyên null nếu không có ảnh */ };
      img.src = url;
    } catch (_) {
      // bỏ qua lỗi tải ảnh
    }
  })();

  // Khi ảnh đã sẵn sàng, cập nhật src cho toàn bộ hộp đã tạo trước đó
  function refreshAllSprites() {
    if (!spriteReady || !spriteUrl) return;
    const list = window.__hupunaBoxes || [];
    for (const b of list) {
      if (b.img && b.img.src !== spriteUrl) b.img.src = spriteUrl;
    }
  }

  // Cấu hình mặc định cho game (có thể thay đổi bằng popup về sau)
  const SETTINGS = {
    enabled: true,            // game đang chạy hay không
    carSpeedMin: 2,           // tốc độ xe tối thiểu (px/frame)
    carSpeedMax: 5,           // tốc độ xe tối đa
    dropBatchMin: 1,          // số hộp rơi tối thiểu mỗi lần xe rơi
    dropBatchMax: 3,          // số hộp rơi tối đa
    dropChanceFast: 0.10,     // xác suất rơi khi xe chạy nhanh
    boxGravityMin: 0.6,       // gia tốc rơi min cho hộp
    boxGravityMax: 1.4        // gia tốc rơi max cho hộp
  };

  // Tạo 1 hộp mới tại vị trí (x,y) với kích thước hiển thị w,h và cấp level (để merge kiểu 2048)
  function spawnBoxAt(x, y, w, h, level) {
    // wrapper
    const wrap = document.createElement('div');
    wrap.style.position = 'fixed';
    wrap.style.left = x - w / 2 + 'px';
    wrap.style.top = y - h / 2 + 'px';
    wrap.style.width = w + 'px';
    wrap.style.height = h + 'px';
    wrap.style.zIndex = '2147483647';
    wrap.style.pointerEvents = 'auto';
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.justifyContent = 'center';
    wrap.style.userSelect = 'none';

    const img = document.createElement('img');
    if (spriteReady && spriteUrl) img.src = spriteUrl; // nếu ảnh đã sẵn sàng thì gán ngay
    img.alt = 'carton';
    img.style.width = '100%';
    img.style.height = '100%';
    img.draggable = false;

    wrap.appendChild(img);
    document.documentElement.appendChild(wrap);

    // Hệ số gia tốc rơi riêng cho từng hộp
    const gScaleRand = SETTINGS.boxGravityMin + Math.random()*(SETTINGS.boxGravityMax-SETTINGS.boxGravityMin);
    const state = { el: wrap, img, x: x - w / 2, y: y - h / 2, w, h, vx: 0, vy: (Math.random()*2-1), dragging: false, lastMouse: null, level: level ?? levelFromSize(w, h), gScale: gScaleRand };
    attachDrag(state);
    boxes.push(state);
    // Nếu ảnh chưa sẵn sàng, đợi và gán sau
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

  // Gắn sự kiện kéo/thả và ném cho 1 hộp
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
        box.thrownUntil = performance.now() + 600; //ném trong 0.6s
      }
      box.dragging = false;
      // Thử gộp khi thả xuống
      tryMerge(box);
    };
    window.addEventListener('mouseup', box.onUp);
  }

  // Kiểm tra giao nhau AABB giữa 2 hộp a,b
  function intersects(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // gộp 2 hộp cùng cấp khi chồng lên nhau để tạo level cao hơn
  function tryMerge(a) {
    for (const b of boxes) {
      if (b === a) continue;
      if (a.level !== b.level) continue;
      if (!intersects(a, b)) continue;
      // Gộp
      const next = a.level + 1;
      if (next >= SIZE_LEVELS.length) return; // max level
      const { px } = SIZE_LEVELS[next];
      const newW = px; const newH = px;
      const cx = (a.x + a.w / 2 + b.x + b.w / 2) / 2;
      const cy = (a.y + a.h / 2 + b.y + b.h / 2) / 2;
      // remove
      a.el.remove(); b.el.remove();
      const idxA = boxes.indexOf(a); if (idxA >= 0) boxes.splice(idxA, 1);
      const idxB = boxes.indexOf(b); if (idxB >= 0) boxes.splice(idxB, 1);
      const merged = spawnBoxAt(cx, cy, newW, newH, next);
      merged.vy = -4; // small pop
      break;
    }
  }

  // Ghi vị trí hộp
  function updateEl(box) {
    box.el.style.left = Math.round(box.x) + 'px';
    box.el.style.top = Math.round(box.y) + 'px';
  }

  // Vòng lặp mô phỏng mỗi frame: rơi, va chạm tường, hút vào xe, va chạm hộp-hộp
  function step() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    updateCar();
    for (const b of boxes) {
      // Reset trạng thái thrown nếu đã hết thời gian
      if (b.thrownUntil && performance.now() >= b.thrownUntil) {
        b.thrownUntil = null;
      }
      // Bỏ qua vật lý nếu đang kéo hoặc đang trong animation hút
      if (b.dragging || b.el.style.pointerEvents === 'none') continue;
      // Áp dụng vật lý cho hộp tự do
      b.vy += gravity * (b.gScale || 1);
      b.vx *= friction;
      b.vy *= friction;
      b.x += b.vx;
      b.y += b.vy;
      // Va chạm với tường/biên màn hình
      if (b.x < 0) { b.x = 0; b.vx = -b.vx * bounce; }
      if (b.x + b.w > W) { b.x = W - b.w; b.vx = -b.vx * bounce; }
      if (b.y + b.h > H) { b.y = H - b.h; b.vy = -Math.abs(b.vy) * bounce; }
      if (b.y < 0) { b.y = 0; b.vy = Math.abs(b.vy) * bounce; }
      // Dập tắt các vận tốc rất nhỏ để đứng yên
      if (Math.abs(b.vx) < sleepEps) b.vx = 0;
      if (Math.abs(b.vy) < sleepEps) b.vy = 0;
      updateEl(b);
    }

    // Kiểm tra giao hàng: nếu hộp đang kéo hoặc vừa ném (chưa hết thời gian) chạm vào xe → hút vào xe rồi xóa
    if (car) {
      const carRect = { x: car.x, y: car.y, w: car.w, h: car.h };
      for (let i = boxes.length - 1; i >= 0; i--) {
        const b = boxes[i];
        const thrown = b.thrownUntil && performance.now() < b.thrownUntil;
        if (!(b.dragging || thrown)) continue;
        // Chỉ xử lý nếu hộp chưa bị khóa trong animation hút
        if (b.el.style.pointerEvents === 'none') continue;
        if (b.x < carRect.x + carRect.w && b.x + b.w > carRect.x && b.y < carRect.y + carRect.h && b.y + b.h > carRect.y) {
          // Hiệu ứng hút hộp về khoang xe
          const targetX = carRect.x + carRect.w * 0.65 - b.w / 2;
          const targetY = carRect.y + carRect.h * 0.4 - b.h / 2;
          const startX = b.x, startY = b.y, startW = b.w, startH = b.h;
          const duration = 220; // thời gian hoạt ảnh (ms)
          const t0 = performance.now();
          b.dragging = false; // khóa kéo trong lúc hút
          b.el.style.pointerEvents = 'none';
          function easeOut(t){ return 1 - Math.pow(1 - t, 3); } // hàm easing
          function anim(now){
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

    // Va chạm hộp-hộp (AABB, khối lượng giả định bằng nhau)
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const axc = a.x + a.w / 2;
        const ayc = a.y + a.h / 2;
        const bxc = b.x + b.w / 2;
        const byc = b.y + b.h / 2;
        const dx = axc - bxc;
        const dy = ayc - byc;
        const overlapX = a.w / 2 + b.w / 2 - Math.abs(dx);
        const overlapY = a.h / 2 + b.h / 2 - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          // Chọn trục có độ chồng lấn nhỏ hơn để đẩy tách
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
            // Giảm chấn theo phương dọc để xếp chồng ổn định hơn
            a.vy *= bounce; b.vy *= bounce;
          }
          updateEl(a); updateEl(b);
        }
      }
    }
    __frameId = requestAnimationFrame(step);
  }
  __frameId = requestAnimationFrame(step);

  // Các cấp kích thước L×W×H (cm) và kích thước hiển thị tương ứng (px)
  const SIZE_LEVELS = [
    { l: 20, w: 20, h: 20, px: 32 },
    { l: 30, w: 30, h: 30, px: 40 },
    { l: 40, w: 40, h: 40, px: 48 },
    { l: 60, w: 60, h: 60, px: 64 },
    { l: 80, w: 80, h: 80, px: 80 },
    { l: 100, w: 100, h: 100, px: 96 },
    { l: 120, w: 120, h: 120, px: 112 },
    { l: 160, w: 160, h: 160, px: 128 }
  ];
  // Tìm cấp level theo kích thước màn hình (px)
  function levelFromSize(w, h) {
    return SIZE_LEVELS.findIndex(s => s.px === w && s.px === h);
  }

  // Xe giao hàng chạy qua lại
  let carUrl = null; let carReady = false;
  (function resolveCar() {
    try {
      const url = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
        ? chrome.runtime.getURL('shipCod.png')
        : null;
      if (!url) return;
      const img = new Image();
      img.onload = () => { carUrl = url; carReady = true; createCar(); };
      img.onerror = () => {};
      img.src = url;
    } catch (_) {}
  })();
  // Tạo xe giao hàng chạy ở làn ngẫu nhiên phía trên
  function createCar() {
    if (!carReady || car) return;
    const w = 90, h = 80; // kích thước xe
    const wrap = document.createElement('div');
    wrap.style.position = 'fixed';
    wrap.style.left = '0px';
    wrap.style.width = w + 'px';
    wrap.style.height = h + 'px';
    wrap.style.zIndex = '2147483646';
    wrap.style.pointerEvents = 'none';
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.justifyContent = 'center';

    const img = document.createElement('img');
    img.src = carUrl;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.transformOrigin = '50% 50%';

    wrap.appendChild(img);
    document.documentElement.appendChild(wrap);

    car = { el: wrap, img, x: -w, y: 0, w, h, vx: 0, active: true, lane: 0, dropPlan: [], dropIdx: 0 };
    startNewPassFromLeft();
  }

  // Cập nhật chuyển động xe, xử lý ra khỏi màn hình và vào lại đối diện
  function updateCar() {
    if (!car) return;
    const W = window.innerWidth;
    if (!car.active) return;
    car.x += car.vx;
    car.el.style.left = Math.round(car.x) + 'px';
    car.el.style.top = car.lane + 'px';
    car.y = car.lane;
    // Trong mỗi lượt chạy, thả hộp theo plan khi đi qua mốc X
    handleCarDrops(W);

    // Đến mép phải: 20% quay đầu ngay; 80% tiếp tục đi ra hết màn hình rồi 5s quay lại
    if (car.vx > 0 && car.x + car.w >= W && !car.exiting) {
      if (Math.random() < 0.2) {
        // quay đầu lại ngay trong màn hình
        startTurnBackPassFromRight();
      } else {
        // đánh dấu đang đi ra, để xe tiếp tục di chuyển cho đến khi ra hết
        car.exiting = true;
        car.exitDecision = 'right';
      }
    }
    // Xử lý quay lại khi đã đi ra hết bên phải
    if (car.vx > 0 && car.exiting && car.exitDecision === 'right' && car.x > W) {
      exitScreenRightThenReenter();
      car.exiting = false;
      car.exitDecision = null;
    }
    // Xử lý tương tự khi chạy ngược về bên trái
    if (car.vx < 0 && car.x <= -car.w) {
      exitScreenLeftThenReenter();
    }
    // Lật ảnh xe theo hướng chạy (để xe nhìn về phía trước)
    car.img.style.transform = car.vx >= 0 ? 'scaleX(1)' : 'scaleX(-1)';
  }

  // Tạo plan thả hộp cho 1 lượt chạy: random 1..3 mốc X
  function newDropPlanForWidth(W) {
    const count = 1 + Math.floor(Math.random() * 3); // 1..3
    const marks = [];
    for (let i = 0; i < count; i++) {
      // mốc X là tỉ lệ từ 0.2..0.9 chiều rộng
      marks.push(0.2 + Math.random() * 0.7);
    }
    marks.sort((a,b)=>a-b);
    return marks.map(r => r * W);
  }

  // Xử lý thả hộp theo plan khi xe vượt qua mốc X
  function handleCarDrops(W) {
    if (!car.dropPlan || car.dropIdx >= car.dropPlan.length) return;
    const centerX = car.x + car.w * 0.5;
    while (car.dropIdx < car.dropPlan.length && centerX >= car.dropPlan[car.dropIdx]) {
      dropFromCar();
      car.dropIdx += 1;
    }
  }

  // Thả 1 hộp từ khoang xe
  function dropFromCar() {
    const levelChoices = [0,1,2,3,4,5,6];
    const lvl = levelChoices[Math.floor(Math.random()*levelChoices.length)];
    const s = SIZE_LEVELS[lvl];
    const w = s.px, h = s.px;
    const jitterX = (Math.random() - 0.5) * car.w * 0.4;
    const x = car.x + car.w * 0.5 + jitterX;
    const y = car.y + car.h * 0.6;
    const b = spawnBoxAt(x, y, w, h, lvl);
    b.vx += (Math.random()-0.5) * 2;
  }

  // Bắt đầu lượt chạy mới từ bên trái với làn và tốc độ ngẫu nhiên
  function startNewPassFromLeft() {
    const W = window.innerWidth;
    const topOrBottom = Math.random() < 0.5;
    const laneTop = Math.max(10, Math.floor(Math.random() * (window.innerHeight * 0.35)));
    const laneBottom = Math.max(20, window.innerHeight - 80 - 20);
    car.lane = topOrBottom ? laneTop : laneBottom;
    car.x = -car.w;
    car.vx = SETTINGS.carSpeedMin + Math.random() * (SETTINGS.carSpeedMax-SETTINGS.carSpeedMin);
    car.dropPlan = newDropPlanForWidth(W);
    car.dropIdx = 0;
    car.exiting = false; // reset cờ thoát
    car.exitDecision = null;
  }

  // Quay đầu xe khi đang ở bên phải
  function startTurnBackPassFromRight() {
    const W = window.innerWidth;
    car.vx = - (SETTINGS.carSpeedMin + Math.random() * (SETTINGS.carSpeedMax-SETTINGS.carSpeedMin));
    // Khi chạy ngược, dùng mốc X tính theo chiều từ phải sang trái: chuyển đổi thành toạ độ tuyệt đối vẫn ổn nếu so sánh centerX
    car.dropPlan = newDropPlanForWidth(W).map(x => W - x).sort((a,b)=>a-b);
    car.dropIdx = 0;
  }

  // Đi ra phải rồi sau ~5s quay lại từ trái, lane + speed random
  function exitScreenRightThenReenter() {
    car.active = false;
    const delay = 5000 + Math.random()*2000; // khoảng 5-7s
    __timers.push(setTimeout(() => { car.active = true; startNewPassFromLeft(); }, delay));
  }

  // Khi chạy ngược về trái và ra hẳn ngoài → sau ~5s cũng quay lại từ trái bình thường
  function exitScreenLeftThenReenter() {
    car.active = false;
    const delay = 5000 + Math.random()*2000;
    __timers.push(setTimeout(() => { car.active = true; startNewPassFromLeft(); }, delay));
  }
})();

