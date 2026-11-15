class WorldMap {
  constructor(world) {
    this.world = world;
    this.exploredChunks = new Map();
    this.isOpen = false;
    this.zoom = 1.0;
    this.minZoom = 0.25;
    this.maxZoom = 4.0;
    this.panX = 0;
    this.panY = 0;
  }

  discoverAround(playerX, playerY, tileRadius = 14) {
    const centerTx = Math.floor(playerX / TILE_SIZE);
    const centerTy = Math.floor(playerY / TILE_SIZE);

    const minCx = Math.floor((centerTx - tileRadius) / CHUNK_SIZE);
    const maxCx = Math.floor((centerTx + tileRadius) / CHUNK_SIZE);
    const minCy = Math.floor((centerTy - tileRadius) / CHUNK_SIZE);
    const maxCy = Math.floor((centerTy + tileRadius) / CHUNK_SIZE);

    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const key = `${cx},${cy}`;
        let entry = this.exploredChunks.get(key);

        if (!entry) {
          const chunk = this.world.getChunk(cx, cy);
          const colorCounts = new Map();
          for (let i = 0; i < chunk.tiles.length; i++) {
            const t = chunk.tiles[i];
            colorCounts.set(t, (colorCounts.get(t) || 0) + 1);
          }
          let dominantTile = TILES.DEEP_OCEAN;
          let maxCount = -1;
          for (const [tileType, count] of colorCounts.entries()) {
            if (count > maxCount) {
              maxCount = count;
              dominantTile = tileType;
            }
          }

          entry = {
            cx,
            cy,
            mask: new Uint8Array(CHUNK_SIZE * CHUNK_SIZE),
            summaryColor: TILE_COLORS[dominantTile],
            discoveredCount: 0
          };
          this.exploredChunks.set(key, entry);
        }

        const startTx = cx * CHUNK_SIZE;
        const startTy = cy * CHUNK_SIZE;

        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
          for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            const idx = ly * CHUNK_SIZE + lx;
            if (entry.mask[idx] === 1) continue;

            const dist = Math.hypot(startTx + lx - centerTx, startTy + ly - centerTy);
            if (dist <= tileRadius) {
              entry.mask[idx] = 1;
              entry.discoveredCount++;
            }
          }
        }
      }
    }
  }

  toggle(playerX, playerY) {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.panX = playerX / TILE_SIZE;
      this.panY = playerY / TILE_SIZE;
    }
  }

  adjustZoom(delta) {
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * delta));
  }

  render(ctx, viewWidth, viewHeight, player) {
    ctx.fillStyle = "#0a0f1a";
    ctx.fillRect(0, 0, viewWidth, viewHeight);

    const mapX = 12;
    const mapY = 20;
    const mapW = viewWidth - 24;
    const mapH = viewHeight - 36;

    ctx.save();
    ctx.beginPath();
    ctx.rect(mapX, mapY, mapW, mapH);
    ctx.clip();

    ctx.fillStyle = "#111827";
    ctx.fillRect(mapX, mapY, mapW, mapH);

    const centerX = mapX + mapW / 2;
    const centerY = mapY + mapH / 2;
    const tilePx = this.zoom;
    const chunkPx = CHUNK_SIZE * tilePx;
    const useLOD = this.zoom < 0.55;

    for (const entry of this.exploredChunks.values()) {
      if (entry.discoveredCount === 0) continue;

      const screenChunkX = centerX + (entry.cx * CHUNK_SIZE - this.panX) * tilePx;
      const screenChunkY = centerY + (entry.cy * CHUNK_SIZE - this.panY) * tilePx;

      if (
        screenChunkX + chunkPx < mapX ||
        screenChunkX > mapX + mapW ||
        screenChunkY + chunkPx < mapY ||
        screenChunkY > mapY + mapH
      ) {
        continue;
      }

      if (useLOD) {
        ctx.fillStyle = entry.summaryColor;
        ctx.fillRect(
          Math.floor(screenChunkX),
          Math.floor(screenChunkY),
          Math.ceil(chunkPx),
          Math.ceil(chunkPx)
        );
      } else {
        const chunk = this.world.getChunk(entry.cx, entry.cy);
        const step = Math.ceil(tilePx);

        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
          for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            const idx = ly * CHUNK_SIZE + lx;
            if (entry.mask[idx] === 0) continue;

            const tile = chunk.tiles[idx];
            ctx.fillStyle = TILE_COLORS[tile];
            ctx.fillRect(
              Math.floor(screenChunkX + lx * tilePx),
              Math.floor(screenChunkY + ly * tilePx),
              step,
              step
            );
          }
        }
      }
    }

    for (const boat of this.world.boats.values()) {
      const bTx = boat.x / TILE_SIZE;
      const bTy = boat.y / TILE_SIZE;
      const cx = Math.floor(bTx / CHUNK_SIZE);
      const cy = Math.floor(bTy / CHUNK_SIZE);
      const entry = this.exploredChunks.get(`${cx},${cy}`);
      if (!entry || entry.discoveredCount === 0) continue;

      const bx = centerX + (bTx - this.panX) * tilePx;
      const by = centerY + (bTy - this.panY) * tilePx;
      if (bx >= mapX && bx <= mapX + mapW && by >= mapY && by <= mapY + mapH) {
        ctx.fillStyle = boat.guarded ? "#f59e0b" : "#38bdf8";
        ctx.fillRect(Math.round(bx - 1), Math.round(by - 1), 3, 3);
      }
    }

    const pTx = player.x / TILE_SIZE;
    const pTy = player.y / TILE_SIZE;
    const px = centerX + (pTx - this.panX) * tilePx;
    const py = centerY + (pTy - this.panY) * tilePx;

    ctx.fillStyle = "#ef4444";
    ctx.fillRect(Math.round(px - 2), Math.round(py - 2), 4, 4);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(px - 2), Math.round(py - 2), 4, 4);

    ctx.restore();

    ctx.strokeStyle = "#3b5998";
    ctx.lineWidth = 1;
    ctx.strokeRect(mapX, mapY, mapW, mapH);

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "8px monospace";
    ctx.textBaseline = "middle";
    ctx.fillText(`ARCHIPELAGO MAP  (ZOOM: ${this.zoom.toFixed(2)}x)`, 12, 10);
    ctx.fillText(`[WASD] PAN   [+/-] ZOOM   [M] CLOSE`, 12, viewHeight - 8);
  }
}
