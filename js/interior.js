const INT_TILES = {
  VOID: 0,
  WALL_TOP: 1,
  WALL_FACE: 2,
  FLOOR: 3,
  RUG: 4,
  EXIT_MAT: 5
};

class InteriorManager {
  constructor(worldSeed, cultureEngine) {
    this.worldSeed = worldSeed;
    this.culture = cultureEngine;
    this.roomCache = new Map();
    this.activeRoom = null;
    this.returnPos = null;
  }

  getRoom(building) {
    if (this.roomCache.has(building.id)) {
      return this.roomCache.get(building.id);
    }

    let seed = this.worldSeed;
    for (let i = 0; i < building.id.length; i++) {
      seed = Math.imul(seed ^ building.id.charCodeAt(i), 1597334677) >>> 0;
    }
    const rng = new SeededRandom(seed);
    const culture = this.culture.getCultureVector(building.cultureId);

    const isHut = building.settlementId === null;
    const width = isHut ? rng.int(14, 15) : rng.int(16, 18);
    const height = isHut ? rng.int(10, 11) : rng.int(11, 13);

    const tiles = new Uint8Array(width * height);
    const blocked = new Uint8Array(width * height);

    const exitX = Math.floor(width / 2);
    const exitY = height - 2;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (y === 0 || y === height - 1 || x === 0 || x === width - 1) {
          tiles[idx] = INT_TILES.WALL_TOP;
          blocked[idx] = 1;
        } else if (y === 1) {
          tiles[idx] = INT_TILES.WALL_FACE;
          blocked[idx] = 1;
        } else {
          tiles[idx] = INT_TILES.FLOOR;
        }
      }
    }

    tiles[exitY * width + exitX] = INT_TILES.EXIT_MAT;

    const floorStyles = ["wood", "stone", "earth"];
    const floorStyle = isHut ? floorStyles[rng.int(0, 2)] : floorStyles[rng.int(0, 1)];
    const rugColors = ["#991b1b", "#1e40af", "#065f46", "#92400e", "#5b21b6"];
    const rugColor = rugColors[rng.int(0, rugColors.length - 1)];

    const rugW = rng.int(4, 6);
    const rugH = rng.int(3, 4);
    const rugX = Math.floor((width - rugW) / 2);
    const rugY = Math.floor((height - rugH) / 2);
    for (let ry = rugY; ry < rugY + rugH; ry++) {
      for (let rx = rugX; rx < rugX + rugW; rx++) {
        if (tiles[ry * width + rx] === INT_TILES.FLOOR) {
          tiles[ry * width + rx] = INT_TILES.RUG;
        }
      }
    }

    const wallDecor = [];
    const usedWallX = new Set();

    const fpX = rng.int(3, width - 5);
    wallDecor.push({ type: "fireplace", tx: fpX, ty: 1 });
    usedWallX.add(fpX);
    usedWallX.add(fpX + 1);
    blocked[2 * width + fpX] = 1;

    for (let wx = 2; wx < width - 2; wx++) {
      if (usedWallX.has(wx)) continue;
      const roll = rng.next();
      if (roll < 0.28) {
        wallDecor.push({ type: "window", tx: wx, ty: 1 });
        usedWallX.add(wx);
        usedWallX.add(wx + 1);
      } else if (roll < 0.52) {
        wallDecor.push({
          type: "painting",
          tx: wx,
          ty: 1,
          accent: rugColors[rng.int(0, rugColors.length - 1)]
        });
        usedWallX.add(wx);
      } else if (roll < 0.72) {
        wallDecor.push({ type: "shelf", tx: wx, ty: 1 });
        usedWallX.add(wx);
        blocked[2 * width + wx] = 1;
      }
    }

    const furniture = [];
    const canPlaceObj = (tx, ty, w = 1, h = 1) => {
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const cx = tx + dx;
          const cy = ty + dy;
          if (cx <= 1 || cx >= width - 2 || cy <= 2 || cy >= height - 2) return false;
          if (Math.abs(cx - exitX) <= 1 && cy >= exitY - 2) return false;
          if (blocked[cy * width + cx] === 1) return false;
        }
      }
      return true;
    };

    const markBlocked = (tx, ty, w = 1, h = 1) => {
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          blocked[(ty + dy) * width + (tx + dx)] = 1;
        }
      }
    };

    const bedSpots = [
      { tx: 2, ty: 3 },
      { tx: width - 3, ty: 3 },
      { tx: 2, ty: height - 4 }
    ];
    const bedCount = isHut ? 1 : rng.int(1, 2);
    let bedsPlaced = 0;
    for (const spot of bedSpots) {
      if (bedsPlaced >= bedCount) break;
      if (canPlaceObj(spot.tx, spot.ty, 1, 2)) {
        furniture.push({ type: "bed", tx: spot.tx, ty: spot.ty, color: rugColor });
        markBlocked(spot.tx, spot.ty, 1, 2);
        bedsPlaced++;
      }
    }

    const tableX = exitX + (rng.next() < 0.5 ? -2 : 1);
    const tableY = Math.floor(height / 2);
    if (canPlaceObj(tableX, tableY, 2, 1)) {
      furniture.push({ type: "table", tx: tableX, ty: tableY });
      markBlocked(tableX, tableY, 2, 1);

      const chairOffsets = [
        { dx: 0, dy: -1, dir: "down" },
        { dx: 1, dy: 1, dir: "up" },
        { dx: -1, dy: 0, dir: "right" },
        { dx: 2, dy: 0, dir: "left" }
      ];
      for (const ch of chairOffsets) {
        if (rng.next() < 0.65 && canPlaceObj(tableX + ch.dx, tableY + ch.dy, 1, 1)) {
          furniture.push({ type: "chair", tx: tableX + ch.dx, ty: tableY + ch.dy, dir: ch.dir });
          markBlocked(tableX + ch.dx, tableY + ch.dy, 1, 1);
        }
      }
    }

    const chestCount = rng.int(1, 2);
    for (let c = 0; c < chestCount; c++) {
      for (let attempt = 0; attempt < 20; attempt++) {
        const cx = rng.int(2, width - 3);
        const cy = rng.int(3, height - 3);
        if (canPlaceObj(cx, cy, 1, 1)) {
          furniture.push({ type: "chest", tx: cx, ty: cy });
          markBlocked(cx, cy, 1, 1);
          break;
        }
      }
    }

    const residentCount = isHut ? rng.int(1, 2) : rng.int(1, 3);
    const residents = [];
    for (let r = 0; r < residentCount; r++) {
      for (let attempt = 0; attempt < 30; attempt++) {
        const rx = rng.int(3, width - 4);
        const ry = rng.int(3, height - 4);
        if (blocked[ry * width + rx] === 0 && Math.hypot(rx - exitX, ry - exitY) > 2) {
          const npcId = `${building.id}_res_${r}`;
          const profile = this.culture.generateNpcProfile(
            seed + 503 * (r + 1),
            culture,
            "resident"
          );
          residents.push({
            id: npcId,
            settlementId: building.settlementId,
            cultureId: building.cultureId,
            x: rx * TILE_SIZE + TILE_SIZE / 2,
            y: ry * TILE_SIZE + TILE_SIZE / 2,
            facing: "down",
            walkTimer: 0,
            moveTimer: rng.range(0.8, 2.6),
            vx: 0,
            vy: 0,
            profile
          });
          break;
        }
      }
    }

    const room = {
      building,
      width,
      height,
      tiles,
      blocked,
      exitX,
      exitY,
      floorStyle,
      wallColor: building.wallColor,
      roofColor: building.roofColor,
      rugColor,
      wallDecor,
      furniture,
      residents
    };

    this.roomCache.set(building.id, room);
    return room;
  }

  enterBuilding(building, player) {
    this.returnPos = {
      x: (building.doorTx + 0.5) * TILE_SIZE,
      y: (building.doorTy + 1.25) * TILE_SIZE
    };
    this.activeRoom = this.getRoom(building);
    player.x = (this.activeRoom.exitX + 0.5) * TILE_SIZE;
    player.y = (this.activeRoom.exitY - 0.8) * TILE_SIZE;
    player.facing = "up";
  }

  exitBuilding(player) {
    if (!this.returnPos) return;
    player.x = this.returnPos.x;
    player.y = this.returnPos.y;
    player.facing = "down";
    this.activeRoom = null;
    this.returnPos = null;
  }

  isWalkable(tx, ty) {
    const room = this.activeRoom;
    if (!room) return false;
    if (tx < 1 || tx >= room.width - 1 || ty < 2 || ty >= room.height - 1) {
      return false;
    }
    return room.blocked[ty * room.width + tx] === 0;
  }

  updateResidents(dt) {
    const room = this.activeRoom;
    if (!room) return;

    for (const npc of room.residents) {
      npc.moveTimer -= dt;
      if (npc.moveTimer <= 0) {
        npc.moveTimer = 1.4 + Math.random() * 2.4;
        if (Math.random() < 0.55) {
          npc.vx = 0;
          npc.vy = 0;
        } else {
          const dirs = [
            { vx: 1, vy: 0, f: "right" },
            { vx: -1, vy: 0, f: "left" },
            { vx: 0, vy: 1, f: "down" },
            { vx: 0, vy: -1, f: "up" }
          ];
          const pick = dirs[Math.floor(Math.random() * dirs.length)];
          npc.vx = pick.vx * 18;
          npc.vy = pick.vy * 18;
          npc.facing = pick.f;
        }
      }

      if (npc.vx !== 0 || npc.vy !== 0) {
        const nextX = npc.x + npc.vx * dt;
        const nextY = npc.y + npc.vy * dt;
        const tx = Math.floor(nextX / TILE_SIZE);
        const ty = Math.floor(nextY / TILE_SIZE);

        if (this.isWalkable(tx, ty) && !(tx === room.exitX && ty === room.exitY)) {
          npc.x = nextX;
          npc.y = nextY;
          npc.walkTimer += dt * 6;
        } else {
          npc.vx = 0;
          npc.vy = 0;
        }
      } else {
        npc.walkTimer = 0;
      }
    }
  }

  findNearbyResident(player, maxDist = 22) {
    if (!this.activeRoom) return null;
    let closest = null;
    let bestDist = maxDist;
    for (const npc of this.activeRoom.residents) {
      const dist = Math.hypot(npc.x - player.x, npc.y - player.y);
      if (dist < bestDist) {
        bestDist = dist;
        closest = npc;
      }
    }
    return closest;
  }

  render(ctx, viewWidth, viewHeight, player, drawPlayerFn) {
    const room = this.activeRoom;
    if (!room) return;

    ctx.fillStyle = "#090d16";
    ctx.fillRect(0, 0, viewWidth, viewHeight);

    const roomPxW = room.width * TILE_SIZE;
    const roomPxH = room.height * TILE_SIZE;
    const offsetX = Math.floor((viewWidth - roomPxW) / 2);
    const offsetY = Math.floor((viewHeight - roomPxH) / 2) + 6;

    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        const tile = room.tiles[y * room.width + x];
        const sx = offsetX + x * TILE_SIZE;
        const sy = offsetY + y * TILE_SIZE;

        if (tile === INT_TILES.WALL_TOP) {
          ctx.fillStyle = room.roofColor;
          ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          ctx.fillRect(sx + 2, sy + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        } else if (tile === INT_TILES.WALL_FACE) {
          ctx.fillStyle = room.wallColor;
          ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
          ctx.fillStyle = "rgba(0,0,0,0.18)";
          ctx.fillRect(sx, sy + 13, TILE_SIZE, 3);
        } else if (tile === INT_TILES.FLOOR || tile === INT_TILES.RUG || tile === INT_TILES.EXIT_MAT) {
          if (room.floorStyle === "wood") {
            ctx.fillStyle = (x + y) % 2 === 0 ? "#8c5a32" : "#7d4f2b";
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = "#663f20";
            ctx.fillRect(sx, sy + 7, TILE_SIZE, 1);
            ctx.fillRect(sx, sy + 15, TILE_SIZE, 1);
          } else if (room.floorStyle === "stone") {
            ctx.fillStyle = (x + y) % 2 === 0 ? "#64748b" : "#526075";
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = "#334155";
            ctx.strokeRect(sx + 0.5, sy + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
          } else {
            ctx.fillStyle = "#9a7b56";
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
          }

          if (tile === INT_TILES.RUG) {
            ctx.fillStyle = room.rugColor;
            ctx.fillRect(sx + 1, sy + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            ctx.fillStyle = "#fbbf24";
            ctx.fillRect(sx + 2, sy + 2, TILE_SIZE - 4, 1);
            ctx.fillRect(sx + 2, sy + TILE_SIZE - 3, TILE_SIZE - 4, 1);
          } else if (tile === INT_TILES.EXIT_MAT) {
            ctx.fillStyle = "#d97706";
            ctx.fillRect(sx + 2, sy + 4, TILE_SIZE - 4, TILE_SIZE - 4);
            ctx.fillStyle = "#fef08a";
            ctx.fillRect(sx + 6, sy + 9, 4, 3);
          }
        }
      }
    }

    for (const dec of room.wallDecor) {
      const sx = offsetX + dec.tx * TILE_SIZE;
      const sy = offsetY + dec.ty * TILE_SIZE;

      if (dec.type === "fireplace") {
        ctx.fillStyle = "#475569";
        ctx.fillRect(sx + 1, sy + 1, 14, 15);
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(sx + 4, sy + 6, 8, 10);
        ctx.fillStyle = "#f97316";
        ctx.fillRect(sx + 5, sy + 10, 6, 6);
        ctx.fillStyle = "#fde047";
        ctx.fillRect(sx + 6, sy + 12, 4, 4);
      } else if (dec.type === "window") {
        ctx.fillStyle = "#451a03";
        ctx.fillRect(sx + 3, sy + 3, 10, 9);
        ctx.fillStyle = "#7dd3fc";
        ctx.fillRect(sx + 4, sy + 4, 8, 7);
        ctx.fillStyle = "#451a03";
        ctx.fillRect(sx + 7, sy + 4, 2, 7);
        ctx.fillRect(sx + 4, sy + 7, 8, 1);
        ctx.fillStyle = "rgba(254, 240, 138, 0.14)";
        ctx.fillRect(sx + 2, sy + 16, 12, 14);
      } else if (dec.type === "painting") {
        ctx.fillStyle = "#b45309";
        ctx.fillRect(sx + 3, sy + 3, 10, 8);
        ctx.fillStyle = dec.accent;
        ctx.fillRect(sx + 4, sy + 4, 8, 6);
        ctx.fillStyle = "#fef3c7";
        ctx.fillRect(sx + 6, sy + 6, 4, 2);
      } else if (dec.type === "shelf") {
        ctx.fillStyle = "#5c3c24";
        ctx.fillRect(sx + 2, sy + 4, 12, 11);
        ctx.fillStyle = "#3e2716";
        ctx.fillRect(sx + 3, sy + 5, 10, 4);
        ctx.fillRect(sx + 3, sy + 10, 10, 4);
        ctx.fillStyle = "#dc2626";
        ctx.fillRect(sx + 4, sy + 6, 2, 3);
        ctx.fillStyle = "#2563eb";
        ctx.fillRect(sx + 7, sy + 6, 2, 3);
        ctx.fillStyle = "#eab308";
        ctx.fillRect(sx + 10, sy + 11, 2, 3);
      }
    }

    for (const item of room.furniture) {
      const sx = offsetX + item.tx * TILE_SIZE;
      const sy = offsetY + item.ty * TILE_SIZE;

      if (item.type === "bed") {
        ctx.fillStyle = "#5c3c24";
        ctx.fillRect(sx + 2, sy + 1, 12, 30);
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(sx + 4, sy + 3, 8, 6);
        ctx.fillStyle = item.color;
        ctx.fillRect(sx + 3, sy + 10, 10, 19);
      } else if (item.type === "table") {
        ctx.fillStyle = "#451a03";
        ctx.fillRect(sx + 1, sy + 3, 30, 11);
        ctx.fillStyle = "#92400e";
        ctx.fillRect(sx + 2, sy + 2, 28, 9);
      } else if (item.type === "chair") {
        ctx.fillStyle = "#78350f";
        ctx.fillRect(sx + 4, sy + 4, 8, 8);
        ctx.fillStyle = "#b45309";
        ctx.fillRect(sx + 5, sy + 5, 6, 6);
      } else if (item.type === "chest") {
        ctx.fillStyle = "#451a03";
        ctx.fillRect(sx + 2, sy + 4, 12, 10);
        ctx.fillStyle = "#b45309";
        ctx.fillRect(sx + 3, sy + 5, 10, 8);
        ctx.fillStyle = "#fbbf24";
        ctx.fillRect(sx + 7, sy + 8, 2, 3);
      }
    }

    for (const npc of room.residents) {
      const sheet = this.culture.getNpcSpriteSheet(npc.profile);
      const dirIndex = { down: 0, up: 1, left: 2, right: 3 }[npc.facing] || 0;
      const frameIndex = Math.sin(npc.walkTimer) > 0 ? 1 : 0;

      ctx.drawImage(
        sheet,
        dirIndex * 16,
        frameIndex * 16,
        16,
        16,
        Math.round(offsetX + npc.x - 8),
        Math.round(offsetY + npc.y - 8),
        16,
        16
      );
    }

    drawPlayerFn(offsetX + player.x, offsetY + player.y);
  }
}
