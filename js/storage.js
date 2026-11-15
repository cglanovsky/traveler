const SAVE_STORAGE_KEY = "traveler_rpg_save_v1";

class SaveStorage {
  constructor() {
    this.deadNpcs = new Set();
    this.unlockedBoats = new Set();
    this.movedBoats = new Map();
  }

  hasSave() {
    try {
      return localStorage.getItem(SAVE_STORAGE_KEY) !== null;
    } catch (e) {
      return false;
    }
  }

  saveGame(worldSeed, player, world, interior, worldMap, dialogue, artifactEngine) {
    try {
      const fogData = {};
      for (const [key, entry] of worldMap.exploredChunks.entries()) {
        if (entry.discoveredCount > 0) {
          fogData[key] = Array.from(entry.mask);
        }
      }

      const npcInventoriesObj = {};
      for (const [npcId, items] of artifactEngine.npcInventories.entries()) {
        npcInventoriesObj[npcId] = items;
      }

      const boatsObj = {};
      for (const [boatId, boat] of world.boats.entries()) {
        boatsObj[boatId] = {
          x: boat.x,
          y: boat.y,
          guarded: boat.guarded
        };
      }

      const payload = {
        meta: {
          version: 1,
          timestamp: Date.now(),
          worldSeed
        },
        player: {
          x: player.x,
          y: player.y,
          overworldX: player.overworldX,
          overworldY: player.overworldY,
          facing: player.facing,
          hp: player.hp,
          maxHp: player.maxHp,
          coins: player.coins,
          combatKills: player.combatKills,
          inBoat: player.inBoat,
          activeBoatId: player.activeBoatId,
          activeBuildingId: interior.activeRoom ? interior.activeRoom.building.id : null,
          returnPos: interior.returnPos
        },
        inventory: player.inventory,
        fogOfWar: fogData,
        markers: worldMap.markers,
        reputation: {
          settlements: Object.fromEntries(dialogue.settlementRep),
          islands: Object.fromEntries(dialogue.islandRep),
          npcAffinity: Object.fromEntries(dialogue.npcAffinity)
        },
        deltaLog: {
          deadNpcs: Array.from(this.deadNpcs),
          unlockedBoats: Array.from(this.unlockedBoats),
          npcInventories: npcInventoriesObj,
          boats: boatsObj
        }
      };

      localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch (err) {
      console.error("Save failed:", err);
      return false;
    }
  }

  loadGame(player, world, interior, worldMap, dialogue, artifactEngine) {
    try {
      const raw = localStorage.getItem(SAVE_STORAGE_KEY);
      if (!raw) return false;

      const data = JSON.parse(raw);

      // Restore Delta Logs first
      this.deadNpcs = new Set(data.deltaLog?.deadNpcs || []);
      this.unlockedBoats = new Set(data.deltaLog?.unlockedBoats || []);
      this.movedBoats = new Map(Object.entries(data.deltaLog?.boats || {}));

      artifactEngine.npcInventories.clear();
      if (data.deltaLog?.npcInventories) {
        for (const [npcId, items] of Object.entries(data.deltaLog.npcInventories)) {
          artifactEngine.npcInventories.set(npcId, items);
        }
      }

      // Restore Reputation
      dialogue.settlementRep = new Map(Object.entries(data.reputation?.settlements || {}));
      dialogue.islandRep = new Map(Object.entries(data.reputation?.islands || {}));
      dialogue.npcAffinity = new Map(Object.entries(data.reputation?.npcAffinity || {}));

      // Reset world caches so regenerated chunks apply restored deltaLog
      world.chunks.clear();
      world.generatedFeatures.clear();
      world.npcs.clear();
      world.boats.clear();
      interior.roomCache.clear();
      interior.activeRoom = null;
      interior.returnPos = null;

      // Restore Player State
      const p = data.player;
      player.x = p.x;
      player.y = p.y;
      player.overworldX = p.overworldX ?? p.x;
      player.overworldY = p.overworldY ?? p.y;
      player.facing = p.facing || "down";
      player.hp = p.hp;
      player.maxHp = p.maxHp;
      player.coins = p.coins;
      player.combatKills = p.combatKills || 0;
      player.inBoat = p.inBoat || false;
      player.activeBoatId = p.activeBoatId || null;
      player.inventory = data.inventory || [];

      // Ensure surrounding chunks are generated
      const owCx = Math.floor(player.overworldX / (CHUNK_SIZE * TILE_SIZE));
      const owCy = Math.floor(player.overworldY / (CHUNK_SIZE * TILE_SIZE));
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          world.getChunk(owCx + dx, owCy + dy);
        }
      }

      // Apply saved boat overrides
      for (const [boatId, savedBoat] of this.movedBoats.entries()) {
        const existing = world.boats.get(boatId);
        if (existing) {
          existing.x = savedBoat.x;
          existing.y = savedBoat.y;
          existing.guarded = savedBoat.guarded;
        } else {
          world.boats.set(boatId, {
            id: boatId,
            x: savedBoat.x,
            y: savedBoat.y,
            guarded: savedBoat.guarded,
            fee: 15,
            guardNpcId: null
          });
        }
      }

      // Restore Interior context if saved indoors
      if (p.activeBuildingId) {
        const bld = world.buildings.get(p.activeBuildingId);
        if (bld) {
          interior.activeRoom = interior.getRoom(bld);
          interior.returnPos = p.returnPos;
        }
      }

      // Restore Fog of War & Markers
      worldMap.exploredChunks.clear();
      if (data.fogOfWar) {
        for (const [key, arr] of Object.entries(data.fogOfWar)) {
          const [cx, cy] = key.split(",").map(Number);
          const chunk = world.getChunk(cx, cy);
          const mask = new Uint8Array(arr);
          let discoveredCount = 0;
          for (let i = 0; i < mask.length; i++) {
            if (mask[i] === 1) discoveredCount++;
          }
          worldMap.exploredChunks.set(key, {
            cx,
            cy,
            mask,
            summaryColor: TILE_COLORS[chunk.tiles[0]],
            discoveredCount
          });
        }
      }
      worldMap.markers = data.markers || [];

      return true;
    } catch (err) {
      console.error("Load failed:", err);
      return false;
    }
  }
}
