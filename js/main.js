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
const storage = new SaveStorage();
const cultureEngine = new CultureEngine(WORLD_SEED);
const artifactEngine = new ArtifactEngine(WORLD_SEED);
const world = new World(WORLD_SEED, cultureEngine, storage);
const interior = new InteriorManager(WORLD_SEED, cultureEngine, storage);
const worldMap = new WorldMap(world);
const dialogue = new DialogueSystem(WORLD_SEED, world, worldMap, artifactEngine);
const combat = new CombatSystem(world, interior, dialogue, artifactEngine, storage);
const spawn = world.findSpawnTile();

const player = {
  x: spawn.tx * TILE_SIZE + TILE_SIZE / 2,
  y: spawn.ty * TILE_SIZE + TILE_SIZE / 2,
  overworldX: spawn.tx * TILE_SIZE + TILE_SIZE / 2,
  overworldY: spawn.ty * TILE_SIZE + TILE_SIZE / 2,
  width: 12,
  height: 12,
  speed: 68,
  sailSpeed: 88,
  facing: "down",
  walkTimer: 0,
  inBoat: false,
  activeBoatId: null,
  coins: 45,
  hp: 6,
  maxHp: 6,
  combatKills: 0,
  inventory: [
    artifactEngine.generateArtifact(WORLD_SEED + 11),
    artifactEngine.generateArtifact(WORLD_SEED + 29)
  ]
};

const inventoryUI = {
  isOpen: false,
  selectedIndex: 0,
  renaming: false,
  draftName: ""
};

let currentSettlementId = null;
let statusBanner = { text: "", timer: 0 };
function showBanner(text, duration = 2.6) {
  statusBanner = { text, timer: duration };
}

worldMap.discoverAround(player.x, player.y, 16);

const keys = new Set();
window.addEventListener("keydown", (e) => {
  // Game Over Reload Handler
  if (player.hp <= 0) {
    if (e.key === "Enter" || e.key.toLowerCase() === "l") {
      if (storage.loadGame(player, world, interior, worldMap, dialogue, artifactEngine)) {
        showBanner("SAVE LOADED");
      } else {
        location.reload();
      }
    }
    return;
  }

  // Handle typing while renaming an artifact
  if (inventoryUI.isOpen && inventoryUI.renaming) {
    e.preventDefault();
    if (e.key === "Enter") {
      const item = player.inventory[inventoryUI.selectedIndex];
      if (item) {
        item.customName = inventoryUI.draftName.trim() || null;
        showBanner(`RENAMED TO "${artifactEngine.getDisplayName(item).toUpperCase()}"`);
      }
      inventoryUI.renaming = false;
    } else if (e.key === "Escape") {
      inventoryUI.renaming = false;
    } else if (e.key === "Backspace") {
      inventoryUI.draftName = inventoryUI.draftName.slice(0, -1);
    } else if (e.key.length === 1 && inventoryUI.draftName.length < 22) {
      inventoryUI.draftName += e.key;
    }
    return;
  }

  const key = e.key.toLowerCase();
  keys.add(key);

  // Quick Save & Quick Load
  if (!dialogue.activeNpc && !inventoryUI.isOpen) {
    if (key === "k") {
      const ok = storage.saveGame(WORLD_SEED, player, world, interior, worldMap, dialogue, artifactEngine);
      showBanner(ok ? "GAME SAVED TO LOCALSTORAGE" : "SAVE FAILED");
      return;
    }
    if (key === "l") {
      if (storage.hasSave()) {
        const ok = storage.loadGame(player, world, interior, worldMap, dialogue, artifactEngine);
        showBanner(ok ? "SAVED GAME LOADED" : "LOAD FAILED");
      } else {
        showBanner("NO SAVED GAME FOUND");
      }
      return;
    }
  }

  // Dialogue Navigation
  if (dialogue.activeNpc) {
    if (key === "w" || key === "arrowup") {
      const max = dialogue.mode === "menu"
        ? dialogue.options.length
        : dialogue.mode === "trade_sell"
        ? player.inventory.length + 1
        : dialogue.tradeItems.length + 1;
      dialogue.selectedIndex = (dialogue.selectedIndex - 1 + max) % max;
    } else if (key === "s" || key === "arrowdown") {
      const max = dialogue.mode === "menu"
        ? dialogue.options.length
        : dialogue.mode === "trade_sell"
        ? player.inventory.length + 1
        : dialogue.tradeItems.length + 1;
      dialogue.selectedIndex = (dialogue.selectedIndex + 1) % max;
    } else if (key === "e" || key === "enter") {
      dialogue.selectOption(player);
    } else if (key === "escape") {
      dialogue.close();
    }
    return;
  }

  // Inventory Toggle
  if (key === "i") {
    if (worldMap.isOpen) worldMap.isOpen = false;
    inventoryUI.isOpen = !inventoryUI.isOpen;
    inventoryUI.renaming = false;
    inventoryUI.selectedIndex = Math.min(inventoryUI.selectedIndex, Math.max(0, player.inventory.length - 1));
    return;
  }

  if (inventoryUI.isOpen) {
    if (key === "escape") {
      inventoryUI.isOpen = false;
    } else if ((key === "a" || key === "arrowleft") && player.inventory.length > 0) {
      inventoryUI.selectedIndex = (inventoryUI.selectedIndex - 1 + player.inventory.length) % player.inventory.length;
    } else if ((key === "d" || key === "arrowright") && player.inventory.length > 0) {
      inventoryUI.selectedIndex = (inventoryUI.selectedIndex + 1) % player.inventory.length;
    } else if (key === "r" && player.inventory.length > 0) {
      const item = player.inventory[inventoryUI.selectedIndex];
      inventoryUI.renaming = true;
      inventoryUI.draftName = item.customName || "";
    }
    return;
  }

  // Map Toggle
  if (key === "m" || key === "tab") {
    e.preventDefault();
    const mapX = interior.activeRoom && interior.returnPos ? interior.returnPos.x : player.x;
    const mapY = interior.activeRoom && interior.returnPos ? interior.returnPos.y : player.y;
    worldMap.toggle(mapX, mapY);
  }

  if (worldMap.isOpen) {
    if (key === "=" || key === "+") worldMap.adjustZoom(1.35);
    if (key === "-" || key === "_") worldMap.adjustZoom(1 / 1.35);
    if (key === "escape") worldMap.isOpen = false;
    return;
  }

  if (key === " " || key === "z") {
    e.preventDefault();
    combat.triggerAttack(player);
    return;
  }

  if (key === "e") {
    handleInteract();
  }
});

window.addEventListener("keyup", (e) => {
  keys.delete(e.key.toLowerCase());
});

window.addEventListener("wheel", (e) => {
  if (!worldMap.isOpen) return;
  e.preventDefault();
  worldMap.adjustZoom(e.deltaY < 0 ? 1.25 : 1 / 1.25);
}, { passive: false });

function findNearbyBoat(maxDist = 22) {
  let closest = null;
  let bestDist = maxDist;
  for (const boat of world.boats.values()) {
    const dist = Math.hypot(boat.x - player.x, boat.y - player.y);
    if (dist < bestDist) {
      bestDist = dist;
      closest = boat;
    }
  }
  return closest;
}

function findNearbyNpc(maxDist = 22) {
  if (interior.activeRoom) {
    return interior.findNearbyResident(player, maxDist);
  }

  let closest = null;
  let bestDist = maxDist;
  for (const npc of world.npcs.values()) {
    if (npc.dead || npc.hostile) continue;
    const dist = Math.hypot(npc.x - player.x, npc.y - player.y);
    if (dist < bestDist) {
      bestDist = dist;
      closest = npc;
    }
  }
  return closest;
}

function boardBoat(boat) {
  player.inBoat = true;
  player.activeBoatId = boat.id;
  player.x = boat.x;
  player.y = boat.y;
  showBanner("BOARDED BOAT - STEER ONTO SHORE TO DISEMBARK");
}

function handleInteract() {
  if (interior.activeRoom) {
    const resident = findNearbyNpc(22);
    if (resident) {
      dialogue.open(resident, player);
    }
    return;
  }

  if (player.inBoat) return;

  const boat = findNearbyBoat(24);
  if (boat) {
    if (!boat.guarded) {
      boardBoat(boat);
      return;
    } else if (player.coins >= boat.fee) {
      player.coins -= boat.fee;
      boat.guarded = false;
      storage.unlockedBoats.add(boat.id);
      showBanner(`PAID ${boat.fee} COINS TO BOATKEEPER`);
      boardBoat(boat);
      return;
    } else {
      showBanner(`BOATKEEPER WANTS ${boat.fee} COINS (OR DEFEAT GUARD)`);
      return;
    }
  }

  const npc = findNearbyNpc(22);
  if (npc) {
    dialogue.open(npc, player);
  }
}

function canMoveTo(nextX, nextY, mode) {
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
    if (mode === "interior" && !interior.isWalkable(tx, ty)) return false;
    if (mode === "land" && !world.isLandWalkable(tx, ty)) return false;
    if (mode === "water" && !world.isWaterNavigable(tx, ty)) return false;
  }
  return true;
}

function update(dt) {
  if (statusBanner.timer > 0) {
    statusBanner.timer -= dt;
  }

  if (player.hp <= 0 || dialogue.activeNpc || inventoryUI.isOpen) {
    return;
  }

  let vx = 0;
  let vy = 0;
  if (keys.has("w") || keys.has("arrowup")) vy -= 1;
  if (keys.has("s") || keys.has("arrowdown")) vy += 1;
  if (keys.has("a") || keys.has("arrowleft")) vx -= 1;
  if (keys.has("d") || keys.has("arrowright")) vx += 1;

  if (worldMap.isOpen) {
    const panSpeed = 140 / worldMap.zoom;
    worldMap.panX += vx * panSpeed * dt;
    worldMap.panY += vy * panSpeed * dt;
    return;
  }

  combat.update(dt, player, showBanner);
  if (player.hp <= 0) return;

  if (interior.activeRoom) {
    interior.updateResidents(dt);

    if (vx !== 0 || vy !== 0) {
      const len = Math.hypot(vx, vy);
      vx /= len;
      vy /= len;

      if (combat.swingTimer <= 0) {
        if (Math.abs(vx) > Math.abs(vy)) {
          player.facing = vx > 0 ? "right" : "left";
        } else {
          player.facing = vy > 0 ? "down" : "up";
        }
      }

      const moveX = vx * player.speed * dt;
      const moveY = vy * player.speed * dt;
      if (canMoveTo(player.x + moveX, player.y, "interior")) player.x += moveX;
      if (canMoveTo(player.x, player.y + moveY, "interior")) player.y += moveY;
      player.walkTimer += dt * 8;

      const pTx = Math.floor(player.x / TILE_SIZE);
      const pTy = Math.floor(player.y / TILE_SIZE);
      if (pTx === interior.activeRoom.exitX && pTy === interior.activeRoom.exitY) {
        interior.exitBuilding(player);
        showBanner("STEPPED OUTSIDE");
      }
    } else {
      player.walkTimer = 0;
    }
    return;
  }

  world.updateNpcs(dt);

  if (vx !== 0 || vy !== 0) {
    const len = Math.hypot(vx, vy);
    vx /= len;
    vy /= len;

    if (combat.swingTimer <= 0) {
      if (Math.abs(vx) > Math.abs(vy)) {
        player.facing = vx > 0 ? "right" : "left";
      } else {
        player.facing = vy > 0 ? "down" : "up";
      }
    }

    const currentSpeed = player.inBoat ? player.sailSpeed : player.speed;
    const moveX = vx * currentSpeed * dt;
    const moveY = vy * currentSpeed * dt;

    if (!player.inBoat) {
      if (canMoveTo(player.x + moveX, player.y, "land")) player.x += moveX;
      if (canMoveTo(player.x, player.y + moveY, "land")) player.y += moveY;

      const touchBoat = findNearbyBoat(14);
      if (touchBoat && !touchBoat.guarded) {
        boardBoat(touchBoat);
      }

      const pTx = Math.floor(player.x / TILE_SIZE);
      const pTy = Math.floor(player.y / TILE_SIZE);
      if (world.getTile(pTx, pTy) === TILES.DOOR) {
        const bld = world.getBuildingByDoor(pTx, pTy);
        if (bld) {
          interior.enterBuilding(bld, player);
          const count = interior.activeRoom.residents.length;
          showBanner(`ENTERED DWELLING (${count} RESIDENT${count === 1 ? "" : "S"})`);
          return;
        }
      }
    } else {
      const nextX = player.x + moveX;
      const nextY = player.y + moveY;
      const boat = world.boats.get(player.activeBoatId);

      if (canMoveTo(nextX, nextY, "water")) {
        player.x = nextX;
        player.y = nextY;
        if (boat) {
          boat.x = player.x;
          boat.y = player.y;
        }
      } else if (canMoveTo(nextX, nextY, "land")) {
        if (boat) {
          boat.x = player.x;
          boat.y = player.y;
        }
        player.x = nextX;
        player.y = nextY;
        player.inBoat = false;
        player.activeBoatId = null;
        showBanner("DISEMBARKED ON SHORE");
      } else {
        if (canMoveTo(nextX, player.y, "water")) player.x = nextX;
        if (canMoveTo(player.x, nextY, "water")) player.y = nextY;
        if (boat) {
          boat.x = player.x;
          boat.y = player.y;
        }
      }
    }

    player.overworldX = player.x;
    player.overworldY = player.y;
    player.walkTimer += dt * 8;
    worldMap.discoverAround(player.x, player.y, player.inBoat ? 22 : 16);
  } else {
    player.walkTimer = 0;
  }

  const pTx = Math.floor(player.x / TILE_SIZE);
  const pTy = Math.floor(player.y / TILE_SIZE);
  const nearSet = world.getNearbySettlement(pTx, pTy, 18);
  if (nearSet && nearSet.id !== currentSettlementId) {
    currentSettlementId = nearSet.id;
    showBanner(`ENTERING ${nearSet.name.toUpperCase()}`);
  } else if (!nearSet) {
    currentSettlementId = null;
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
  } else if (tile === TILES.ROAD && hash % 5 === 0) {
    ctx.fillStyle = "#9c7c54";
    ctx.fillRect(screenX + 4, screenY + 6, 3, 2);
    ctx.fillRect(screenX + 10, screenY + 11, 2, 2);
  } else if (tile === TILES.ROOF) {
    const bld = world.getBuildingAtTile(tx, ty);
    ctx.fillStyle = bld ? bld.roofColor : TILE_COLORS[TILES.ROOF];
    ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(screenX, screenY + 12, TILE_SIZE, 4);
  } else if (tile === TILES.WALL) {
    const bld = world.getBuildingAtTile(tx, ty);
    ctx.fillStyle = bld ? bld.wallColor : TILE_COLORS[TILES.WALL];
    ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(screenX + 5, screenY + 5, 6, 5);
    ctx.fillStyle = "#fef08a";
    ctx.fillRect(screenX + 6, screenY + 6, 4, 3);
  } else if (tile === TILES.DOOR) {
    const bld = world.getBuildingAtTile(tx, ty);
    ctx.fillStyle = bld ? bld.wallColor : TILE_COLORS[TILES.WALL];
    ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = "#451a03";
    ctx.fillRect(screenX + 3, screenY + 2, 10, 14);
    ctx.fillStyle = "#fbbf24";
    ctx.fillRect(screenX + 10, screenY + 9, 2, 2);
  }
}

function drawBoat(screenX, screenY, facing = "down") {
  const bx = Math.round(screenX - 8);
  const by = Math.round(screenY - 8);

  ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
  ctx.fillRect(bx + 1, by + 11, 14, 3);

  ctx.fillStyle = "#7c4a21";
  ctx.fillRect(bx + 2, by + 4, 12, 8);
  ctx.fillStyle = "#a36634";
  ctx.fillRect(bx + 3, by + 5, 10, 6);

  ctx.fillStyle = "#f8fafc";
  if (facing === "left" || facing === "right") {
    ctx.fillRect(bx + 7, by + 1, 2, 8);
    ctx.fillRect(bx + 5, by + 2, 6, 4);
  } else {
    ctx.fillRect(bx + 7, by + 1, 2, 8);
    ctx.fillRect(bx + 4, by + 2, 8, 4);
  }
}

function drawNpc(npc, screenX, screenY) {
  if (npc.dead) return;
  const sheet = cultureEngine.getNpcSpriteSheet(npc.profile);
  const dirIndex = { down: 0, up: 1, left: 2, right: 3 }[npc.facing] || 0;
  const frameIndex = Math.sin(npc.walkTimer) > 0 ? 1 : 0;

  ctx.drawImage(
    sheet,
    dirIndex * 16,
    frameIndex * 16,
    16,
    16,
    Math.round(screenX - 8),
    Math.round(screenY - 8),
    16,
    16
  );

  combat.renderHealthBar(ctx, npc, screenX, screenY);
}

function drawPlayer(screenX, screenY) {
  if (combat.playerInvuln > 0 && Math.floor(combat.playerInvuln * 20) % 2 === 0) {
    return;
  }

  if (player.inBoat && !interior.activeRoom) {
    drawBoat(screenX, screenY, player.facing);
    ctx.fillStyle = "#2b6cb0";
    ctx.fillRect(Math.round(screenX - 2), Math.round(screenY - 4), 4, 4);
    ctx.fillStyle = "#c53030";
    ctx.fillRect(Math.round(screenX - 2), Math.round(screenY - 6), 4, 2);
    return;
  }

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

function drawInventoryScreen() {
  ctx.fillStyle = "#0a0f1a";
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  ctx.strokeStyle = "#3b82f6";
  ctx.lineWidth = 1;
  ctx.strokeRect(10.5, 18.5, VIEW_WIDTH - 21, VIEW_HEIGHT - 34);

  ctx.fillStyle = "#e2e8f0";
  ctx.font = "8px monospace";
  ctx.textBaseline = "middle";
  ctx.fillText(`ARTIFACT SATCHEL (${player.inventory.length})   COINS:${player.coins}`, 12, 10);
  ctx.fillText(`[A/D] SELECT   [R] RENAME   [I] CLOSE`, 12, VIEW_HEIGHT - 8);

  if (player.inventory.length === 0) {
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("No artifacts carried.", 96, 115);
    return;
  }

  const cols = 6;
  for (let i = 0; i < player.inventory.length; i++) {
    const item = player.inventory[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const sx = 22 + col * 46;
    const sy = 28 + row * 34;

    ctx.fillStyle = i === inventoryUI.selectedIndex ? "#1e3a8a" : "#1e293b";
    ctx.fillRect(sx, sy, 36, 28);
    if (i === inventoryUI.selectedIndex) {
      ctx.strokeStyle = "#fde047";
      ctx.strokeRect(sx + 0.5, sy + 0.5, 35, 27);
    }

    const spr = artifactEngine.getSprite(item);
    ctx.drawImage(spr, sx + 6, sy + 2, 24, 24);
  }

  const selected = player.inventory[inventoryUI.selectedIndex];
  if (selected) {
    ctx.fillStyle = "#111827";
    ctx.fillRect(16, 128, VIEW_WIDTH - 32, 72);
    ctx.strokeStyle = "#475569";
    ctx.strokeRect(16.5, 128.5, VIEW_WIDTH - 33, 71);

    const spr = artifactEngine.getSprite(selected);
    ctx.drawImage(spr, 24, 138, 48, 48);

    ctx.textBaseline = "top";
    ctx.fillStyle = "#fde047";
    ctx.fillText(artifactEngine.getDisplayName(selected), 82, 136);

    ctx.fillStyle = "#94a3b8";
    ctx.fillText(`SYMMETRY: ${selected.symmetry.toUpperCase()}`, 82, 148);
    ctx.fillText(`BASE VALUE: ${selected.baseValue} COINS`, 82, 160);

    if (inventoryUI.renaming) {
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(82, 174, 206, 16);
      ctx.strokeStyle = "#fde047";
      ctx.strokeRect(82.5, 174.5, 205, 15);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`NAME: ${inventoryUI.draftName}_`, 86, 178);
    } else {
      ctx.fillStyle = "#38bdf8";
      ctx.fillText(`PRESS [R] TO ASSIGN CUSTOM NAME`, 82, 178);
    }
  }
}

function drawGameOverScreen() {
  ctx.fillStyle = "rgba(9, 13, 22, 0.92)";
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "14px monospace";
  ctx.fillStyle = "#ef4444";
  ctx.fillText("TRAVELER HAS FALLEN", VIEW_WIDTH / 2, VIEW_HEIGHT / 2 - 24);

  ctx.font = "8px monospace";
  ctx.fillStyle = "#e2e8f0";
  const prompt = storage.hasSave()
    ? "PRESS [ENTER] TO RELOAD SAVED GAME"
    : "PRESS [ENTER] TO BEGIN A NEW JOURNEY";
  ctx.fillText(prompt, VIEW_WIDTH / 2, VIEW_HEIGHT / 2 + 8);
  ctx.textAlign = "left";
}

function drawHUD() {
  ctx.fillStyle = "rgba(11, 19, 32, 0.85)";
  ctx.fillRect(0, 0, VIEW_WIDTH, 16);

  for (let i = 0; i < player.maxHp; i++) {
    ctx.fillStyle = i < player.hp ? "#ef4444" : "#334155";
    ctx.fillRect(6 + i * 7, 5, 5, 5);
  }

  ctx.fillStyle = "#e2e8f0";
  ctx.font = "8px monospace";
  ctx.textBaseline = "middle";
  const dmg = combat.getPlayerDamage(player);
  ctx.fillText(`C:${player.coins} ATK:${dmg}`, 52, 8);
  ctx.fillText(`[I] [M] [E] [SPC] [K]SAVE`, VIEW_WIDTH - 128, 8);

  if (!player.inBoat && !dialogue.activeNpc) {
    const nearBoat = interior.activeRoom ? null : findNearbyBoat(24);
    const nearNpc = findNearbyNpc(22);

    if (nearBoat && nearBoat.guarded) {
      ctx.fillStyle = "rgba(11, 19, 32, 0.85)";
      ctx.fillRect(46, VIEW_HEIGHT - 22, VIEW_WIDTH - 92, 16);
      ctx.fillStyle = "#fbbf24";
      ctx.fillText(`[E] HIRE BOAT (${nearBoat.fee} COINS)`, 66, VIEW_HEIGHT - 14);
    } else if (nearNpc) {
      ctx.fillStyle = "rgba(11, 19, 32, 0.85)";
      ctx.fillRect(54, VIEW_HEIGHT - 22, VIEW_WIDTH - 108, 16);
      ctx.fillStyle = "#a7f3d0";
      ctx.fillText(`[E] TALK TO ${nearNpc.profile.name.toUpperCase()}`, 66, VIEW_HEIGHT - 14);
    }
  }

  if (statusBanner.timer > 0) {
    ctx.fillStyle = "rgba(11, 19, 32, 0.88)";
    ctx.fillRect(16, 22, VIEW_WIDTH - 32, 16);
    ctx.fillStyle = "#93c5fd";
    ctx.fillText(statusBanner.text, 24, 30);
  }
}

function render() {
  ctx.save();
  ctx.scale(renderScale, renderScale);

  if (player.hp <= 0) {
    drawGameOverScreen();
    ctx.restore();
    return;
  }

  if (inventoryUI.isOpen) {
    drawInventoryScreen();
    ctx.restore();
    return;
  }

  if (worldMap.isOpen) {
    worldMap.render(ctx, VIEW_WIDTH, VIEW_HEIGHT, player);
    ctx.restore();
    return;
  }

  if (interior.activeRoom) {
    interior.render(ctx, VIEW_WIDTH, VIEW_HEIGHT, player, drawPlayer, combat);
    drawHUD();
    if (dialogue.activeNpc) {
      dialogue.render(ctx, VIEW_WIDTH, VIEW_HEIGHT, player);
    }
    ctx.restore();
    return;
  }

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

  for (const boat of world.boats.values()) {
    if (player.inBoat && boat.id === player.activeBoatId) continue;
    const bx = boat.x - camX;
    const by = boat.y - camY;
    if (bx >= -16 && bx <= VIEW_WIDTH + 16 && by >= -16 && by <= VIEW_HEIGHT + 16) {
      drawBoat(bx, by);
    }
  }

  for (const npc of world.npcs.values()) {
    const nx = npc.x - camX;
    const ny = npc.y - camY;
    if (nx >= -16 && nx <= VIEW_WIDTH + 16 && ny >= -16 && ny <= VIEW_HEIGHT + 16) {
      drawNpc(npc, nx, ny);
    }
  }

  drawPlayer(player.x - camX, player.y - camY);
  combat.renderSword(ctx, player.x - camX, player.y - camY, player.facing);
  drawHUD();

  if (dialogue.activeNpc) {
    dialogue.render(ctx, VIEW_WIDTH, VIEW_HEIGHT, player);
  }

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
