const TILE_SIZE = 16;
const CHUNK_SIZE = 32;

const TILES = {
  DEEP_OCEAN: 0,
  SHOAL: 1,
  SAND: 2,
  GRASS: 3,
  FOREST: 4,
  HILL: 5,
  ROAD: 6,
  WALL: 7,
  ROOF: 8,
  DOOR: 9
};

const TILE_COLORS = {
  [TILES.DEEP_OCEAN]: "#163a5f",
  [TILES.SHOAL]: "#256699",
  [TILES.SAND]: "#e2ca76",
  [TILES.GRASS]: "#4e9a51",
  [TILES.FOREST]: "#2d6a3e",
  [TILES.HILL]: "#7a7d7d",
  [TILES.ROAD]: "#b5946b",
  [TILES.WALL]: "#d6d3d1",
  [TILES.ROOF]: "#991b1b",
  [TILES.DOOR]: "#451a03"
};

class World {
  constructor(seed, cultureEngine, storage) {
    this.seed = seed;
    this.culture = cultureEngine;
    this.storage = storage;
    this.macroNoise = new ValueNoise2D(seed);
    this.detailNoise = new ValueNoise2D(seed + 1013);
    this.forestNoise = new ValueNoise2D(seed + 2027);

    this.chunks = new Map();
    this.boats = new Map();
    this.settlements = new Map();
    this.buildings = new Map();
    this.npcs = new Map();
    this.generatedFeatures = new Set();
  }

  getElevation(tx, ty) {
    const continentScale = 0.0085;
    const detailScale = 0.038;

    let macro = this.macroNoise.fbm(tx * continentScale, ty * continentScale, 4);
    const detail = this.detailNoise.fbm(tx * detailScale, ty * detailScale, 3);

    const distFromOrigin = Math.hypot(tx, ty);
    if (distFromOrigin < 45) {
      const boost = (1 - distFromOrigin / 45) * 0.28;
      macro += boost;
    }

    return macro * 0.78 + detail * 0.22;
  }

  getBaseTileType(tx, ty) {
    const elevation = this.getElevation(tx, ty);

    if (elevation < 0.43) return TILES.DEEP_OCEAN;
    if (elevation < 0.47) return TILES.SHOAL;
    if (elevation < 0.50) return TILES.SAND;
    if (elevation > 0.72) return TILES.HILL;

    const treeDensity = this.forestNoise.fbm(tx * 0.08, ty * 0.08, 2);
    if (treeDensity > 0.58) return TILES.FOREST;

    return TILES.GRASS;
  }

  isLandWalkable(tx, ty) {
    const tile = this.getTile(tx, ty);
    return (
      tile === TILES.SAND ||
      tile === TILES.GRASS ||
      tile === TILES.FOREST ||
      tile === TILES.ROAD ||
      tile === TILES.DOOR
    );
  }

  isWaterNavigable(tx, ty) {
    const tile = this.getTile(tx, ty);
    return tile === TILES.DEEP_OCEAN || tile === TILES.SHOAL;
  }

  chunkKey(cx, cy) {
    return `${cx},${cy}`;
  }

  placeBuilding(tiles, cx, cy, lx, ly, buildingId, settlementId, culture) {
    const startTx = cx * CHUNK_SIZE;
    const startTy = cy * CHUNK_SIZE;

    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        const idx = (ly + dy) * CHUNK_SIZE + (lx + dx);
        if (dy === 0) {
          tiles[idx] = TILES.ROOF;
        } else if (dy === 2 && dx === 1) {
          tiles[idx] = TILES.DOOR;
        } else {
          tiles[idx] = TILES.WALL;
        }
      }
    }

    const doorTx = startTx + lx + 1;
    const doorTy = startTy + ly + 2;

    this.buildings.set(buildingId, {
      id: buildingId,
      settlementId,
      cultureId: culture.id,
      tx: startTx + lx,
      ty: startTy + ly,
      doorTx,
      doorTy,
      roofColor: culture.roofColor,
      wallColor: culture.wallColor
    });

    if (ly + 3 < CHUNK_SIZE) {
      const frontIdx = (ly + 3) * CHUNK_SIZE + (lx + 1);
      if (tiles[frontIdx] === TILES.FOREST || tiles[frontIdx] === TILES.GRASS) {
        tiles[frontIdx] = TILES.ROAD;
      }
    }
  }

  canPlaceHouseAt(tiles, lx, ly) {
    if (lx < 2 || ly < 2 || lx + 4 >= CHUNK_SIZE || ly + 4 >= CHUNK_SIZE) {
      return false;
    }
    for (let dy = -1; dy <= 3; dy++) {
      for (let dx = -1; dx <= 3; dx++) {
        const t = tiles[(ly + dy) * CHUNK_SIZE + (lx + dx)];
        if (t !== TILES.GRASS && t !== TILES.FOREST && t !== TILES.SAND) {
          return false;
        }
      }
    }
    return true;
  }

  generateChunk(cx, cy) {
    const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    const startX = cx * CHUNK_SIZE;
    const startY = cy * CHUNK_SIZE;

    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        tiles[ly * CHUNK_SIZE + lx] = this.getBaseTileType(startX + lx, startY + ly);
      }
    }

    const chunk = { cx, cy, tiles };
    this.chunks.set(this.chunkKey(cx, cy), chunk);
    this.populateChunkFeatures(cx, cy, tiles);
    return chunk;
  }

  populateChunkFeatures(cx, cy, tiles) {
    const key = this.chunkKey(cx, cy);
    if (this.generatedFeatures.has(key)) return;
    this.generatedFeatures.add(key);

    const rng = new SeededRandom(hashCoords(this.seed + 7717, cx, cy));
    const startTx = cx * CHUNK_SIZE;
    const startTy = cy * CHUNK_SIZE;
    const cultureId = this.culture.getCultureId(startTx + 16, startTy + 16);
    const culture = this.culture.getCultureVector(cultureId);

    let landCount = 0;
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] === TILES.GRASS || tiles[i] === TILES.FOREST || tiles[i] === TILES.SAND) {
        landCount++;
      }
    }

    const isStarterChunk = cx === 0 && cy === 0;
    let hasSettlement = false;

    if (landCount > 480 && (isStarterChunk || rng.next() < 0.28)) {
      const settlementId = `set_${cx}_${cy}`;
      const nameSeed = hashCoords(this.seed + 311, cx, cy);
      const settlementName = this.culture.generateSettlementName(nameSeed, culture);

      const roadY = rng.int(10, 20);
      for (let lx = 3; lx < CHUNK_SIZE - 3; lx++) {
        const idx = roadY * CHUNK_SIZE + lx;
        if (tiles[idx] === TILES.GRASS || tiles[idx] === TILES.FOREST || tiles[idx] === TILES.SAND) {
          tiles[idx] = TILES.ROAD;
        }
      }

      const targetHouses = rng.int(3, 6);
      let placed = 0;
      const houseCandidates = [4, 9, 14, 19, 24];

      for (const hx of houseCandidates) {
        if (placed >= targetHouses) break;
        const aboveY = roadY - 4;
        const belowY = roadY + 2;

        if (this.canPlaceHouseAt(tiles, hx, aboveY)) {
          this.placeBuilding(tiles, cx, cy, hx, aboveY, `bld_${cx}_${cy}_${placed}`, settlementId, culture);
          placed++;
        } else if (this.canPlaceHouseAt(tiles, hx, belowY)) {
          this.placeBuilding(tiles, cx, cy, hx, belowY, `bld_${cx}_${cy}_${placed}`, settlementId, culture);
          placed++;
        }
      }

      if (placed > 0) {
        hasSettlement = true;
        this.settlements.set(settlementId, {
          id: settlementId,
          name: settlementName,
          tx: startTx + 16,
          ty: startTy + roadY,
          cultureId
        });

        const villagerCount = rng.int(2, 4);
        for (let v = 0; v < villagerCount; v++) {
          const npcId = `npc_${cx}_${cy}_${v}`;
          if (this.storage.deadNpcs.has(npcId)) continue;

          const vx = startTx + rng.int(6, CHUNK_SIZE - 6);
          const vy = startTy + roadY + (rng.next() < 0.5 ? -1 : 1);
          const profile = this.culture.generateNpcProfile(
            hashCoords(this.seed + 9001 + v, cx, cy),
            culture,
            "villager"
          );
          const segments = rng.int(2, 3);
          this.npcs.set(npcId, {
            id: npcId,
            role: "villager",
            settlementId,
            cultureId,
            x: vx * TILE_SIZE + TILE_SIZE / 2,
            y: vy * TILE_SIZE + TILE_SIZE / 2,
            homeX: vx * TILE_SIZE + TILE_SIZE / 2,
            homeY: vy * TILE_SIZE + TILE_SIZE / 2,
            facing: "down",
            walkTimer: 0,
            moveTimer: rng.range(0.5, 2.5),
            vx: 0,
            vy: 0,
            hostile: false,
            segments,
            hp: segments * 2,
            maxHp: segments * 2,
            profile
          });
        }
      }
    } else if (landCount > 220 && rng.next() < 0.35) {
      for (let attempt = 0; attempt < 15; attempt++) {
        const hx = rng.int(4, CHUNK_SIZE - 8);
        const hy = rng.int(4, CHUNK_SIZE - 8);
        if (this.canPlaceHouseAt(tiles, hx, hy)) {
          this.placeBuilding(tiles, cx, cy, hx, hy, `hut_${cx}_${cy}`, null, culture);
          break;
        }
      }
    }

    // Hostile Roaming Wilderness Raiders (outside settlements)
    if (!hasSettlement && landCount > 180 && rng.next() < 0.55) {
      const distFactor = Math.min(6, Math.floor(Math.hypot(cx, cy) * 0.8));
      const enemyCount = rng.int(1, 2);

      for (let e = 0; e < enemyCount; e++) {
        const enemyId = `enemy_${cx}_${cy}_${e}`;
        if (this.storage.deadNpcs.has(enemyId)) continue;

        for (let attempt = 0; attempt < 20; attempt++) {
          const lx = rng.int(4, CHUNK_SIZE - 5);
          const ly = rng.int(4, CHUNK_SIZE - 5);
          const t = tiles[ly * CHUNK_SIZE + lx];
          if (t === TILES.GRASS || t === TILES.FOREST || t === TILES.SAND) {
            const profile = this.culture.generateNpcProfile(
              hashCoords(this.seed + 6101 + e, cx, cy),
              culture,
              "raider"
            );
            const segments = Math.min(10, rng.int(1, 3) + distFactor);
            const ex = (startTx + lx) * TILE_SIZE + TILE_SIZE / 2;
            const ey = (startTy + ly) * TILE_SIZE + TILE_SIZE / 2;
            this.npcs.set(enemyId, {
              id: enemyId,
              role: "raider",
              settlementId: null,
              cultureId,
              x: ex,
              y: ey,
              homeX: ex,
              homeY: ey,
              facing: "down",
              walkTimer: 0,
              moveTimer: rng.range(0.5, 2.0),
              vx: 0,
              vy: 0,
              hostile: true,
              chaseSpeed: 38 + Math.min(16, segments * 2),
              segments,
              hp: segments * 2,
              maxHp: segments * 2,
              profile
            });
            break;
          }
        }
      }
    }

    // Boats along coastlines
    if (isStarterChunk || rng.next() < 0.42) {
      const candidates = [];
      for (let ly = 1; ly < CHUNK_SIZE - 1; ly++) {
        for (let lx = 1; lx < CHUNK_SIZE - 1; lx++) {
          if (tiles[ly * CHUNK_SIZE + lx] !== TILES.SHOAL) continue;

          const neighbors = [
            tiles[(ly - 1) * CHUNK_SIZE + lx],
            tiles[(ly + 1) * CHUNK_SIZE + lx],
            tiles[ly * CHUNK_SIZE + (lx - 1)],
            tiles[ly * CHUNK_SIZE + (lx + 1)]
          ];
          const hasBeach = neighbors.includes(TILES.SAND);
          const hasDeepWater =
            neighbors.includes(TILES.DEEP_OCEAN) ||
            neighbors.filter((n) => n === TILES.SHOAL).length >= 2;

          if (hasBeach && hasDeepWater) {
            candidates.push({ tx: startTx + lx, ty: startTy + ly });
          }
        }
      }

      if (candidates.length > 0) {
        const spot = candidates[rng.int(0, candidates.length - 1)];
        const boatId = `boat_${cx}_${cy}`;
        const wasUnlocked = this.storage.unlockedBoats.has(boatId);
        const guarded = (isStarterChunk || wasUnlocked) ? false : rng.next() < 0.45;
        let guardNpcId = null;

        if (guarded) {
          const dirs = [
            { dx: 0, dy: -1 },
            { dx: 0, dy: 1 },
            { dx: -1, dy: 0 },
            { dx: 1, dy: 0 }
          ];
          for (const d of dirs) {
            const ntx = spot.tx + d.dx;
            const nty = spot.ty + d.dy;
            const nTile = this.getBaseTileType(ntx, nty);
            if (nTile === TILES.SAND || nTile === TILES.GRASS) {
              guardNpcId = `guard_${cx}_${cy}`;
              if (!this.storage.deadNpcs.has(guardNpcId)) {
                const profile = this.culture.generateNpcProfile(
                  hashCoords(this.seed + 4409, cx, cy),
                  culture,
                  "boatkeeper"
                );
                const segments = rng.int(3, 5);
                this.npcs.set(guardNpcId, {
                  id: guardNpcId,
                  role: "boatkeeper",
                  guardingBoatId: boatId,
                  settlementId: null,
                  cultureId,
                  x: ntx * TILE_SIZE + TILE_SIZE / 2,
                  y: nty * TILE_SIZE + TILE_SIZE / 2,
                  homeX: ntx * TILE_SIZE + TILE_SIZE / 2,
                  homeY: nty * TILE_SIZE + TILE_SIZE / 2,
                  facing: "down",
                  walkTimer: 0,
                  moveTimer: 999,
                  vx: 0,
                  vy: 0,
                  stationary: true,
                  hostile: false,
                  segments,
                  hp: segments * 2,
                  maxHp: segments * 2,
                  profile
                });
              } else {
                guardNpcId = null;
              }
              break;
            }
          }
        }

        const movedOverride = this.storage.movedBoats.get(boatId);
        this.boats.set(boatId, {
          id: boatId,
          x: movedOverride ? movedOverride.x : spot.tx * TILE_SIZE + TILE_SIZE / 2,
          y: movedOverride ? movedOverride.y : spot.ty * TILE_SIZE + TILE_SIZE / 2,
          guarded: movedOverride ? movedOverride.guarded : (guarded && guardNpcId !== null),
          fee: 15,
          guardNpcId
        });
      }
    }
  }

  getChunk(cx, cy) {
    const key = this.chunkKey(cx, cy);
    if (!this.chunks.has(key)) {
      return this.generateChunk(cx, cy);
    }
    return this.chunks.get(key);
  }

  getTile(tx, ty) {
    const cx = Math.floor(tx / CHUNK_SIZE);
    const cy = Math.floor(ty / CHUNK_SIZE);
    const lx = ((tx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const ly = ((ty % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const chunk = this.getChunk(cx, cy);
    return chunk.tiles[ly * CHUNK_SIZE + lx];
  }

  getBuildingAtTile(tx, ty) {
    for (const b of this.buildings.values()) {
      if (tx >= b.tx && tx < b.tx + 3 && ty >= b.ty && ty < b.ty + 3) {
        return b;
      }
    }
    return null;
  }

  getBuildingByDoor(tx, ty) {
    for (const b of this.buildings.values()) {
      if (b.doorTx === tx && b.doorTy === ty) {
        return b;
      }
    }
    return null;
  }

  getNearbySettlement(tx, ty, radius = 24) {
    let best = null;
    let bestDist = radius;
    for (const s of this.settlements.values()) {
      const d = Math.hypot(s.tx - tx, s.ty - ty);
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    return best;
  }

  updateNpcs(dt) {
    for (const npc of this.npcs.values()) {
      if (npc.stationary || npc.hostile) continue;

      npc.moveTimer -= dt;
      if (npc.moveTimer <= 0) {
        npc.moveTimer = 1.2 + Math.random() * 2.2;
        if (Math.random() < 0.45) {
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
          npc.vx = pick.vx * 22;
          npc.vy = pick.vy * 22;
          npc.facing = pick.f;
        }
      }

      if (npc.vx !== 0 || npc.vy !== 0) {
        const nextX = npc.x + npc.vx * dt;
        const nextY = npc.y + npc.vy * dt;
        const distFromHome = Math.hypot(nextX - npc.homeX, nextY - npc.homeY);
        const tx = Math.floor(nextX / TILE_SIZE);
        const ty = Math.floor(nextY / TILE_SIZE);

        if (distFromHome < 40 && this.isLandWalkable(tx, ty) && this.getTile(tx, ty) !== TILES.DOOR) {
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

  pruneChunks(centerCx, centerCy, keepRadius = 4) {
    for (const [key, chunk] of this.chunks.entries()) {
      if (
        Math.abs(chunk.cx - centerCx) > keepRadius ||
        Math.abs(chunk.cy - centerCy) > keepRadius
      ) {
        this.chunks.delete(key);
      }
    }
  }

  findSpawnTile() {
    for (let radius = 0; radius < 40; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const tile = this.getTile(dx, dy);
          if (tile === TILES.ROAD || tile === TILES.GRASS || tile === TILES.SAND) {
            return { tx: dx, ty: dy };
          }
        }
      }
    }
    return { tx: 0, ty: 0 };
  }
}
