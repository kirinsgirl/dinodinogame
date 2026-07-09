/* ============================================================
   CHROME DINO — canvas runner core
   Exposes window.DinoGame = { start(), jump(), state }
   so hand-control.js can drive it purely via gesture events.
   ============================================================ */

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const W = canvas.width;
  const H = canvas.height;
  const GROUND_Y = H - 40;

  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlaySub = document.getElementById('overlaySub');

  const COLORS = {
    ink: '#2E2A24',
    cactus: '#4F7A5A',
    cactusDeep: '#395C42',
    ground: '#2E2A24',
    cloud: 'rgba(46,42,36,0.25)'
  };

  const STATE = {
    WAITING: 'waiting',
    PLAYING: 'playing',
    GAMEOVER: 'gameover'
  };

  let best = Number(localStorage.getItem('fingerDinoBest') || 0);
  bestEl.textContent = String(best).padStart(5, '0');

  const dino = {
    x: 60,
    y: GROUND_Y - 44,
    w: 34,
    h: 44,
    vy: 0,
    gravity: 0.62,
    jumpForce: -11.4,
    grounded: true,
    legFrame: 0
  };

  let obstacles = [];
  let clouds = [];
  let groundOffset = 0;
  let speed = 6.2;
  let baseSpeed = 6.2;
  let score = 0;
  let frame = 0;
  let spawnTimer = 0;
  let nextSpawnIn = 70;
  let state = STATE.WAITING;
  let rafId = null;

  function resetWorld() {
    dino.y = GROUND_Y - dino.h;
    dino.vy = 0;
    dino.grounded = true;
    obstacles = [];
    clouds = makeClouds();
    speed = baseSpeed;
    score = 0;
    frame = 0;
    spawnTimer = 0;
    nextSpawnIn = 70;
  }

  function makeClouds() {
    const arr = [];
    for (let i = 0; i < 4; i++) {
      arr.push({
        x: Math.random() * W,
        y: 30 + Math.random() * 70,
        s: 0.6 + Math.random() * 0.8
      });
    }
    return arr;
  }

  function setOverlay(title, sub, visible) {
    overlayTitle.textContent = title;
    overlaySub.textContent = sub;
    overlay.classList.toggle('hidden', !visible);
  }

  function jump() {
    if (state === STATE.WAITING) {
      startGame();
      return;
    }
    if (state !== STATE.PLAYING) return;
    if (dino.grounded) {
      dino.vy = dino.jumpForce;
      dino.grounded = false;
    }
  }

  function startGame() {
    resetWorld();
    state = STATE.PLAYING;
    setOverlay('', '', false);
    if (!rafId) loop();
  }

  function gameOver() {
    state = STATE.GAMEOVER;
    if (score > best) {
      best = score;
      localStorage.setItem('fingerDinoBest', String(best));
      bestEl.textContent = String(best).padStart(5, '0');
    }
    setOverlay('GAME OVER', 'Show ☝️ again to retry', true);
  }

  function attemptStart() {
    // Called on "index only" gesture rising edge.
    if (state === STATE.WAITING || state === STATE.GAMEOVER) {
      startGame();
    }
  }

  function spawnObstacle() {
    // vary cactus cluster width/height for a bit of texture
    const cluster = 1 + (Math.random() < 0.25 ? 1 : 0) + (Math.random() < 0.1 ? 1 : 0);
    const w = 14 * cluster + (cluster - 1) * 4;
    const h = 30 + Math.random() * 14;
    obstacles.push({
      x: W + 20,
      y: GROUND_Y - h,
      w,
      h
    });
  }

  function update() {
    frame++;
    score += 0.12;
    speed = baseSpeed + Math.min(score / 300, 5.5);

    // ground scroll
    groundOffset = (groundOffset + speed) % 24;

    // clouds
    clouds.forEach(c => {
      c.x -= speed * 0.25;
      if (c.x < -60) c.x = W + Math.random() * 40;
    });

    // dino physics
    dino.vy += dino.gravity;
    dino.y += dino.vy;
    if (dino.y >= GROUND_Y - dino.h) {
      dino.y = GROUND_Y - dino.h;
      dino.vy = 0;
      dino.grounded = true;
    }
    if (dino.grounded) {
      dino.legFrame = Math.floor(frame / 6) % 2;
    }

    // obstacles
    spawnTimer++;
    if (spawnTimer >= nextSpawnIn) {
      spawnObstacle();
      spawnTimer = 0;
      nextSpawnIn = 55 + Math.random() * 55 - Math.min(score / 20, 25);
      nextSpawnIn = Math.max(nextSpawnIn, 32);
    }
    obstacles.forEach(o => (o.x -= speed));
    obstacles = obstacles.filter(o => o.x + o.w > -10);

    // collision (slightly inset hitboxes for fairness)
    const dHit = { x: dino.x + 6, y: dino.y + 6, w: dino.w - 12, h: dino.h - 10 };
    for (const o of obstacles) {
      const oHit = { x: o.x + 3, y: o.y + 3, w: o.w - 6, h: o.h - 3 };
      if (
        dHit.x < oHit.x + oHit.w &&
        dHit.x + dHit.w > oHit.x &&
        dHit.y < oHit.y + oHit.h &&
        dHit.y + dHit.h > oHit.y
      ) {
        gameOver();
        break;
      }
    }
  }

  function drawGround() {
    ctx.strokeStyle = COLORS.ground;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(W, GROUND_Y);
    ctx.stroke();

    ctx.fillStyle = COLORS.ground;
    for (let x = -24; x < W + 24; x += 24) {
      ctx.fillRect(x - groundOffset, GROUND_Y + 6, 10, 2);
    }
  }

  function drawClouds() {
    ctx.fillStyle = COLORS.cloud;
    clouds.forEach(c => {
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 22 * c.s, 8 * c.s, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawDino() {
    ctx.fillStyle = COLORS.ink;
    const { x, y, w, h } = dino;
    // body
    ctx.fillRect(x, y, w, h - 10);
    // head
    ctx.fillRect(x + w - 12, y - 8, 16, 16);
    // eye (sand cutout)
    ctx.fillStyle = '#F2E9D8';
    ctx.fillRect(x + w - 4, y - 4, 3, 3);
    ctx.fillStyle = COLORS.ink;
    // legs (simple two-frame run cycle)
    if (state === STATE.PLAYING) {
      if (dino.legFrame === 0) {
        ctx.fillRect(x + 4, y + h - 10, 8, 10);
        ctx.fillRect(x + w - 14, y + h - 10, 8, 6);
      } else {
        ctx.fillRect(x + 4, y + h - 10, 8, 6);
        ctx.fillRect(x + w - 14, y + h - 10, 8, 10);
      }
    } else {
      ctx.fillRect(x + 4, y + h - 10, 8, 10);
      ctx.fillRect(x + w - 14, y + h - 10, 8, 10);
    }
  }

  function drawObstacles() {
    ctx.fillStyle = COLORS.cactus;
    obstacles.forEach(o => {
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = COLORS.cactusDeep;
      ctx.fillRect(o.x + 2, o.y + 4, 3, o.h - 8);
      ctx.fillRect(o.x + o.w - 5, o.y + 8, 3, o.h - 12);
      ctx.fillStyle = COLORS.cactus;
    });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawClouds();
    drawGround();
    drawObstacles();
    drawDino();
    scoreEl.textContent = String(Math.floor(score)).padStart(5, '0');
  }

  function loop() {
    if (state === STATE.PLAYING) {
      update();
    }
    draw();
    rafId = requestAnimationFrame(loop);
  }

  // initial paint (idle dino on ground)
  resetWorld();
  draw();
  setOverlay('SHOW ☝️ TO START', 'Hold up your index finger to the camera', true);
  loop();

  // Keep keyboard as a fallback/dev aid — space/up jumps, doesn't replace gestures
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      jump();
    }
  });

  window.DinoGame = {
    jump,
    attemptStart,
    getState: () => state,
    STATE
  };
})();

