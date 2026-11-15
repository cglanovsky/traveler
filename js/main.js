const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const VIEW_WIDTH = 320;
const VIEW_HEIGHT = 240;
let renderScale = 3;

function resizeCanvas() {
  const maxScaleX = Math.floor((window.innerWidth - 24) / VIEW_WIDTH);
  const maxScaleY = Math.floor((window.innerHeight - 24) / VIEW_HEIGHT);
  renderScale = Math.max(1, Math.min(maxScaleX, maxScaleY));

  canvas.width = VIEW_WIDTH * renderScale;
  canvas.height = VIEW_HEIGHT * renderScale;
  ctx.imageSmoothingEnabled = false;
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

const WORLD_SEED = 48151623;
const world = new World(WORLD_SEED);
const spawn = world.findSpawnTile();

const player = {
  x: spawn.tx * TILE_SIZE + TILE_SIZE / 2,
  y: spawn.ty * TILE_SIZE + TILE_SIZE / 2,
  width: 12,
  height: 12,
  speed: 68,
  facing: "down",
  walkTimer: 0
};

const keys = new Set();
window.addEventListener("keydown", (e) => {
  keys.add(e.key.toLowerCase());
});
window.addEventListener("keyup", (e) => {
  keys.delete(e.key.toLowerCase());
});

function canMoveTo(nextX, nextY) {
  const halfW = player.width / 2 - 1;
  const halfH = player.height / 2 - 1;

  const corners = [
    { x: nextX - halfW, y: nextY - halfH },
    { x: nextX + halfW, y: nextY - halfH },
    { x: nextX - halfW, y: nextY + halfH },
    { x: nextX + halfW, y: nextY + halfH }
  ];

  for (const c of corners) {
    const tx = Math.floor(c.x / TILE_SIZE);
    const ty = Math.floor(c.y / TILE_SIZE);
    if (!world.isWalkable(tx, ty)) {
      return false;
    }
  }
  return true;
}

function update(dt) {
  let vx = 0;
  let vy = 0;

  if (keys.has("w") || keys.has("arrowup")) vy -= 1;
  if (keys.has("s") || keys.has("arrowdown")) vy += 1;
  if (keys.has("a") || keys.has("arrowleft")) vx -= 1;
  if (keys.has("d") || keys.has("arrowright")) vx += 1;

  if (vx !== 0 || vy !== 0) {
    const len = Math.hypot(vx, vy);
    vx /= len;
    vy /= len;

    if (Math.abs(vx) > Math.abs(vy)) {
      player.facing = vx > 0 ? "right" : "left";
    } else {
      player.facing = vy > 0 ? "down" : "up";
    }

    const moveX = vx * player.speed * dt;
    const moveY = vy * player.speed * dt;

    if (canMoveTo(player.x + moveX, player.y)) {
      player.x += moveX;
    }
    if (canMoveTo(player.x, player.y + moveY)) {
      player.y += moveY;
    }

    player.walkTimer += dt * 8;
  } else {
    player.walkTimer = 0;
  }

  const playerCx = Math.floor(player.x / (CHUNK_SIZE * TILE_SIZE));
  const playerCy = Math.floor(player.y / (CHUNK_SIZE * TILE_SIZE));
  world.pruneChunks(playerCx, playerCy, 4);
}

function drawTileDetail(screenX, screenY, tile, tx, ty) {
  const hash = hashCoords(WORLD_SEED, tx, ty);

  if (tile === TILES.DEEP_OCEAN && hash % 19 === 0) {
    ctx.fillStyle = "#204e7a";
    ctx.fillRect(screenX + 4, screenY + 7, 6, 2);
  } else if (tile === TILES.SHOAL && hash % 13 === 0) {
    ctx.fillStyle = "#4188bd";
    ctx.fillRect(screenX + 3, screenY + 8, 5, 2);
  } else if (tile === TILES.SAND && hash % 11 === 0) {
    ctx.fillStyle = "#c9b05d";
    ctx.fillRect(screenX + 6, screenY + 6, 2, 2);
  } else if (tile === TILES.GRASS && hash % 7 === 0) {
    ctx.fillStyle = "#3c7e3f";
    ctx.fillRect(screenX + 5, screenY + 9, 2, 3);
    ctx.fillRect(screenX + 9, screenY + 7, 2, 3);
  } else if (tile === TILES.FOREST) {
    ctx.fillStyle = "#1b4327";
    ctx.fillRect(screenX + 3, screenY + 2, 10, 9);
    ctx.fillStyle = "#245733";
    ctx.fillRect(screenX + 4, screenY + 3, 8, 6);
    ctx.fillStyle = "#5c3c24";
    ctx.fillRect(screenX + 7, screenY + 11, 2, 4);
  } else if (tile === TILES.HILL) {
    ctx.fillStyle = "#595c5c";
    ctx.fillRect(screenX + 2, screenY + 5, 12, 9);
    ctx.fillStyle = "#9da1a1";
    ctx.fillRect(screenX + 4, screenY + 3, 8, 4);
  }
}

function drawPlayer(screenX, screenY) {
  const px = Math.round(screenX - 8);
  const py = Math.round(screenY - 8);
  const bob = Math.sin(player.walkTimer) > 0 ? 1 : 0;

  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.fillRect(px + 3, py + 13, 10, 3);

  ctx.fillStyle = "#3b2818";
  ctx.fillRect(px + 4, py + 12 - bob, 3, 3);
  ctx.fillRect(px + 9, py + 12 + (bob ? 0 : -1), 3, 3);

  ctx.fillStyle = "#2b6cb0";
  ctx.fillRect(px + 4, py + 7, 8, 6);

  ctx.fillStyle = "#f2c6a0";
  ctx.fillRect(px + 4, py + 2, 8, 6);

  ctx.fillStyle = "#c53030";
  ctx.fillRect(px + 3, py + 1, 10, 3);

  ctx.fillStyle = "#1a202c";
  if (player.facing === "down") {
    ctx.fillRect(px + 5, py + 5, 2, 2);
    ctx.fillRect(px + 9, py + 5, 2, 2);
  } else if (player.facing === "left") {
    ctx.fillRect(px + 4, py + 5, 2, 2);
  } else if (player.facing === "right") {
    ctx.fillRect(px + 10, py + 5, 2, 2);
  }
}

function drawHUD() {
  ctx.fillStyle = "rgba(11, 19, 32, 0.78)";
  ctx.fillRect(0, 0, VIEW_WIDTH, 16);

  ctx.fillStyle = "#e2e8f0";
  ctx.font = "8px monospace";
  ctx.textBaseline = "middle";

  const tx = Math.floor(player.x / TILE_SIZE);
  const ty = Math.floor(player.y / TILE_SIZE);
  ctx.fillText(`TRAVELER  POS: ${tx}, ${ty}`, 6, 8);
  ctx.fillText(`WASD / ARROWS: MOVE`, VIEW_WIDTH - 104, 8);
}

function render() {
  ctx.save();
  ctx.scale(renderScale, renderScale);

  const camX = Math.floor(player.x - VIEW_WIDTH / 2);
  const camY = Math.floor(player.y - VIEW_HEIGHT / 2);

  const startTx = Math.floor(camX / TILE_SIZE) - 1;
  const endTx = Math.ceil((camX + VIEW_WIDTH) / TILE_SIZE) + 1;
  const startTy = Math.floor(camY / TILE_SIZE) - 1;
  const endTy = Math.ceil((camY + VIEW_HEIGHT) / TILE_SIZE) + 1;

  for (let ty = startTy; ty <= endTy; ty++) {
    for (let tx = startTx; tx <= endTx; tx++) {
      const tile = world.getTile(tx, ty);
      const screenX = tx * TILE_SIZE - camX;
      const screenY = ty * TILE_SIZE - camY;

      ctx.fillStyle = TILE_COLORS[tile];
      ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
      drawTileDetail(screenX, screenY, tile, tx, ty);
    }
  }

  drawPlayer(player.x - camX, player.y - camY);
  drawHUD();

  ctx.restore();
}

let lastTime = performance.now();
function gameLoop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  update(dt);
  render();
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
