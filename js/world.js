const TILE_SIZE = 16;
const CHUNK_SIZE = 32;

const TILES = {
  DEEP_OCEAN: 0,
  SHOAL: 1,
  SAND: 2,
  GRASS: 3,
  FOREST: 4,
  HILL: 5,
  ROAD: 6
};

const TILE_COLORS = {
  [TILES.DEEP_OCEAN]: "#163a5f",
  [TILES.SHOAL]: "#256699",
  [TILES.SAND]: "#e2ca76",
  [TILES.GRASS]: "#4e9a51",
  [TILES.FOREST]: "#2d6a3e",
  [TILES.HILL]: "#7a7d7d",
  [TILES.ROAD]: "#b5946b"
};

class World {
  constructor(seed) {
    this.seed = seed;
    this.macroNoise = new ValueNoise2D(seed);
    this.detailNoise = new ValueNoise2D(seed + 1013);
    this.forestNoise = new ValueNoise2D(seed + 2027);
    this.chunks = new Map();
    this.boats = new Map();
    this.spawnedChunkBoats = new Set();
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

  getTileType(tx, ty) {
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
    return tile === TILES.SAND || tile === TILES.GRASS || tile === TILES.FOREST || tile === TILES.ROAD;
  }

  isWaterNavigable(tx, ty) {
    const tile = this.getTile(tx, ty);
    return tile === TILES.DEEP_OCEAN || tile === TILES.SHOAL;
  }

  chunkKey(cx, cy) {
    return `${cx},${cy}`;
  }

  generateChunk(cx, cy) {
    const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    const startX = cx * CHUNK_SIZE;
    const startY = cy * CHUNK_SIZE;

    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const tx = startX + lx;
        const ty = startY + ly;
        tiles[ly * CHUNK_SIZE + lx] = this.getTileType(tx, ty);
      }
    }

    const chunk = { cx, cy, tiles };
    this.chunks.set(this.chunkKey(cx, cy), chunk);
    this.spawnBoatsForChunk(cx, cy, tiles);
    return chunk;
  }

  spawnBoatsForChunk(cx, cy, tiles) {
    const key = this.chunkKey(cx, cy);
    if (this.spawnedChunkBoats.has(key)) return;
    this.spawnedChunkBoats.add(key);

    const rng = new SeededRandom(hashCoords(this.seed + 5501, cx, cy));
    if (cx !== 0 || cy !== 0) {
      if (rng.next() > 0.42) return;
    }

    const candidates = [];
    for (let ly = 1; ly < CHUNK_SIZE - 1; ly++) {
      for (let lx = 1; lx < CHUNK_SIZE - 1; lx++) {
        const t = tiles[ly * CHUNK_SIZE + lx];
        if (t !== TILES.SHOAL) continue;

        const neighbors = [
          tiles[(ly - 1) * CHUNK_SIZE + lx],
          tiles[(ly + 1) * CHUNK_SIZE + lx],
          tiles[ly * CHUNK_SIZE + (lx - 1)],
          tiles[ly * CHUNK_SIZE + (lx + 1)]
        ];
        const hasBeach = neighbors.includes(TILES.SAND);
        const hasDeepWater = neighbors.includes(TILES.DEEP_OCEAN) || neighbors.filter(n => n === TILES.SHOAL).length >= 2;

        if (hasBeach && hasDeepWater) {
          candidates.push({
            tx: cx * CHUNK_SIZE + lx,
            ty: cy * CHUNK_SIZE + ly,
            lx,
            ly
          });
        }
      }
    }

    if (candidates.length === 0) return;

    const spot = candidates[rng.int(0, candidates.length - 1)];
    const boatId = `boat_${cx}_${cy}`;
    if (this.boats.has(boatId)) return;

    const guarded = (cx === 0 && cy === 0) ? false : rng.next() < 0.45;
    let guardPos = null;

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
        const nTile = this.getTileType(ntx, nty);
        if (nTile === TILES.SAND || nTile === TILES.GRASS) {
          guardPos = {
            x: ntx * TILE_SIZE + TILE_SIZE / 2,
            y: nty * TILE_SIZE + TILE_SIZE / 2
          };
          break;
        }
      }
    }

    this.boats.set(boatId, {
      id: boatId,
      x: spot.tx * TILE_SIZE + TILE_SIZE / 2,
      y: spot.ty * TILE_SIZE + TILE_SIZE / 2,
      guarded: guarded && guardPos !== null,
      fee: 15,
      guardPos
    });
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
          if (tile === TILES.GRASS || tile === TILES.SAND) {
            return { tx: dx, ty: dy };
          }
        }
      }
    }
    return { tx: 0, ty: 0 };
  }
}
