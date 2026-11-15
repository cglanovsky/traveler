class DialogueSystem {
  constructor(worldSeed, world, worldMap, artifactEngine) {
    this.worldSeed = worldSeed;
    this.world = world;
    this.worldMap = worldMap;
    this.artifacts = artifactEngine;

    this.npcAffinity = new Map();
    this.settlementRep = new Map();
    this.islandRep = new Map();

    this.activeNpc = null;
    this.mode = "menu"; // "menu" | "trade_sell" | "trade_buy"
    this.message = "";
    this.selectedIndex = 0;
    this.options = [];
    this.tradeItems = [];
  }

  getReputationOffset(npc) {
    const setRep = npc.settlementId ? (this.settlementRep.get(npc.settlementId) || 0) : 0;
    const islRep = npc.cultureId ? (this.islandRep.get(npc.cultureId) || 0) : 0;
    return setRep + islRep;
  }

  getAffinity(npc) {
    if (!this.npcAffinity.has(npc.id)) {
      const rng = new SeededRandom(hashCoords(this.worldSeed + 331, npc.id.length, npc.profile.name.length));
      const base = rng.int(-10, 25) + this.getReputationOffset(npc);
      this.npcAffinity.set(npc.id, Math.max(-100, Math.min(100, base)));
    }
    return this.npcAffinity.get(npc.id);
  }

  shiftAffinity(npc, delta) {
    const next = Math.max(-100, Math.min(100, this.getAffinity(npc) + delta));
    this.npcAffinity.set(npc.id, next);
    return next;
  }

  applyViolencePenalty(npc) {
    if (npc.settlementId) {
      this.settlementRep.set(npc.settlementId, (this.settlementRep.get(npc.settlementId) || 0) - 40);
    }
    if (npc.cultureId) {
      this.islandRep.set(npc.cultureId, (this.islandRep.get(npc.cultureId) || 0) - 15);
    }
  }

  getDispositionLabel(affinity) {
    if (affinity >= 45) return "WARM";
    if (affinity >= 10) return "FRIENDLY";
    if (affinity >= -20) return "NEUTRAL";
    if (affinity >= -55) return "WARY";
    return "HOSTILE";
  }

  pickWeightedResponse(affinity, pool) {
    const norm = (affinity + 100) / 200; // 0 to 1
    const posWeight = 0.15 + norm * 0.70;
    const neuWeight = 0.50 - Math.abs(norm - 0.5) * 0.40;
    const negWeight = Math.max(0.05, 1 - posWeight - neuWeight);

    const roll = Math.random() * (posWeight + neuWeight + negWeight);
    if (roll < posWeight) return { tone: "pos", text: pool.pos };
    if (roll < posWeight + neuWeight) return { tone: "neu", text: pool.neu };
    return { tone: "neg", text: pool.neg };
  }

  open(npc, player) {
    this.activeNpc = npc;
    this.mode = "menu";
    this.selectedIndex = 0;

    const aff = this.getAffinity(npc);
    if (aff >= 30) {
      this.message = `Ah, Traveler! Good to see a trusted face.`;
    } else if (aff >= -15) {
      this.message = `Greetings, stranger. What brings you here?`;
    } else {
      this.message = `Speak quickly. Folk here don't trust outsiders.`;
    }

    this.buildMenuOptions(player);
  }

  close() {
    this.activeNpc = null;
    this.mode = "menu";
  }

  buildMenuOptions(player) {
    const npc = this.activeNpc;
    const aff = this.getAffinity(npc);
    const healCost = aff >= 40 ? 0 : Math.max(4, Math.round(14 - aff * 0.1));

    this.options = [
      { id: "converse", label: "Greet & Converse" },
      { id: "rumor", label: "Ask for Rumors / Info" },
      { id: "sell", label: `Sell Artifacts (${player.inventory.length})` },
      { id: "buy", label: "Browse NPC Artifacts" },
      {
        id: "heal",
        label: player.hp < player.maxHp
          ? `Request Healing (${healCost === 0 ? "FREE" : healCost + "c"})`
          : "Request Healing (Full HP)"
      },
      { id: "provoke", label: "Threaten / Intimidate" },
      { id: "leave", label: "Leave" }
    ];
    this.selectedIndex = Math.min(this.selectedIndex, this.options.length - 1);
  }

  getSellPrice(artifact, affinity) {
    const norm = (affinity + 100) / 200;
    return Math.max(5, Math.round(artifact.baseValue * (0.45 + 0.45 * norm)));
  }

  getBuyPrice(artifact, affinity) {
    const norm = (affinity + 100) / 200;
    return Math.max(10, Math.round(artifact.baseValue * (1.35 - 0.35 * norm)));
  }

  selectOption(player) {
    const npc = this.activeNpc;
    if (!npc) return;

    if (this.mode === "trade_sell") {
      if (this.selectedIndex >= player.inventory.length) {
        this.mode = "menu";
        this.selectedIndex = 0;
        this.buildMenuOptions(player);
        return;
      }
      const item = player.inventory.splice(this.selectedIndex, 1)[0];
      const aff = this.getAffinity(npc);
      const price = this.getSellPrice(item, aff);
      player.coins += price;

      const culture = this.world.culture.getCultureVector(npc.cultureId || "cult_0_0");
      const npcInv = this.artifacts.getNpcInventory(npc.id, hashCoords(this.worldSeed, npc.id.length, 77), culture);
      npcInv.push(item);

      this.shiftAffinity(npc, 6);
      this.message = `Sold "${this.artifacts.getDisplayName(item)}" for ${price} coins!`;
      this.selectedIndex = Math.min(this.selectedIndex, player.inventory.length);
      return;
    }

    if (this.mode === "trade_buy") {
      if (this.selectedIndex >= this.tradeItems.length) {
        this.mode = "menu";
        this.selectedIndex = 0;
        this.buildMenuOptions(player);
        return;
      }
      const item = this.tradeItems[this.selectedIndex];
      const aff = this.getAffinity(npc);
      const price = this.getBuyPrice(item, aff);
      if (player.coins < price) {
        this.message = `You need ${price} coins to buy that artifact.`;
        return;
      }
      player.coins -= price;
      this.tradeItems.splice(this.selectedIndex, 1);
      player.inventory.push(item);
      this.shiftAffinity(npc, 8);
      this.message = `Bought "${this.artifacts.getDisplayName(item)}" for ${price} coins!`;
      this.selectedIndex = Math.min(this.selectedIndex, this.tradeItems.length);
      return;
    }

    const opt = this.options[this.selectedIndex];
    if (!opt) return;

    if (opt.id === "leave") {
      this.close();
      return;
    }

    const aff = this.getAffinity(npc);

    if (opt.id === "converse") {
      const res = this.pickWeightedResponse(aff, {
        pos: "You have a kind spirit, Traveler. May the tides favor you!",
        neu: "Life on these islands moves with the wind and the sea.",
        neg: "I have little patience for idle chatter today."
      });
      if (res.tone === "pos") this.shiftAffinity(npc, 10);
      else if (res.tone === "neu") this.shiftAffinity(npc, 3);
      else this.shiftAffinity(npc, -6);
      this.message = res.text;
      this.buildMenuOptions(player);
    } else if (opt.id === "rumor") {
      if (aff < -35) {
        this.message = "Why would I share secrets with the likes of you?";
        return;
      }
      this.shareIntelligence(npc, player);
      this.shiftAffinity(npc, 4);
      this.buildMenuOptions(player);
    } else if (opt.id === "sell") {
      if (player.inventory.length === 0) {
        this.message = "You aren't carrying any artifacts to sell.";
        return;
      }
      this.mode = "trade_sell";
      this.selectedIndex = 0;
      this.message = "Select an artifact to sell:";
    } else if (opt.id === "buy") {
      const culture = this.world.culture.getCultureVector(npc.cultureId || "cult_0_0");
      this.tradeItems = this.artifacts.getNpcInventory(
        npc.id,
        hashCoords(this.worldSeed, npc.id.length, 77),
        culture
      );
      if (this.tradeItems.length === 0) {
        this.message = "I have no artifacts in my possession right now.";
        return;
      }
      this.mode = "trade_buy";
      this.selectedIndex = 0;
      this.message = "Select an artifact to purchase:";
    } else if (opt.id === "heal") {
      if (player.hp >= player.maxHp) {
        this.message = "You look completely healthy already!";
        return;
      }
      if (aff < -45) {
        this.message = "Tend your own wounds. I won't help you.";
        return;
      }
      const healCost = aff >= 40 ? 0 : Math.max(4, Math.round(14 - aff * 0.1));
      if (player.coins < healCost) {
        this.message = `Healing costs ${healCost} coins, and your purse is light.`;
        return;
      }
      player.coins -= healCost;
      player.hp = player.maxHp;
      this.shiftAffinity(npc, 5);
      this.message = healCost === 0
        ? "As a friend, I gladly mend your wounds for free!"
        : `Paid ${healCost} coins. Your health is fully restored!`;
      this.buildMenuOptions(player);
    } else if (opt.id === "provoke") {
      this.shiftAffinity(npc, -28);
      if (Math.random() < 0.35 && aff > -30) {
        const loot = 8 + Math.floor(Math.random() * 12);
        player.coins += loot;
        this.message = `Startled, ${npc.profile.name} hands over ${loot} coins!`;
      } else {
        this.message = `${npc.profile.name} glares coldly: "Get out of my sight!"`;
      }
      this.buildMenuOptions(player);
    }
  }

  shareIntelligence(npc, player) {
    const pTx = Math.floor((player.overworldX || player.x) / TILE_SIZE);
    const pTy = Math.floor((player.overworldY || player.y) / TILE_SIZE);

    // Search nearby chunks for a settlement, boat, or unvisited island direction
    const cx0 = Math.floor(pTx / CHUNK_SIZE);
    const cy0 = Math.floor(pTy / CHUNK_SIZE);

    for (let r = 1; r <= 4; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          this.world.getChunk(cx0 + dx, cy0 + dy);
        }
      }
    }

    const roll = Math.random();
    if (roll < 0.45 && this.world.settlements.size > 0) {
      let target = null;
      for (const s of this.world.settlements.values()) {
        if (Math.hypot(s.tx - pTx, s.ty - pTy) > 18) {
          target = s;
          break;
        }
      }
      if (target) {
        this.worldMap.addMarker(target.tx, target.ty, target.name, "#fde047");
        this.message = `Rumor: "${target.name}" lies at (${target.tx}, ${target.ty}). Marked on map!`;
        return;
      }
    }

    if (roll < 0.78 && this.world.boats.size > 0) {
      let targetBoat = null;
      for (const b of this.world.boats.values()) {
        const bTx = Math.floor(b.x / TILE_SIZE);
        const bTy = Math.floor(b.y / TILE_SIZE);
        if (Math.hypot(bTx - pTx, bTy - pTy) > 10) {
          targetBoat = { tx: bTx, ty: bTy, guarded: b.guarded };
          break;
        }
      }
      if (targetBoat) {
        this.worldMap.addMarker(targetBoat.tx, targetBoat.ty, "Boat", "#38bdf8");
        this.message = `A ${targetBoat.guarded ? "guarded" : "free"} boat is moored near (${targetBoat.tx}, ${targetBoat.ty}).`;
        return;
      }
    }

    // Artifact rumor
    const artTx = pTx + (Math.random() < 0.5 ? 26 : -26);
    const artTy = pTy + (Math.random() < 0.5 ? 22 : -22);
    this.worldMap.addMarker(artTx, artTy, "Artifact Rumor", "#e879f9");
    this.message = `Travelers speak of a rare artifact near (${artTx}, ${artTy}). Marked!`;
  }

  render(ctx, viewWidth, viewHeight, player) {
    const npc = this.activeNpc;
    if (!npc) return;

    const aff = this.getAffinity(npc);
    const disp = this.getDispositionLabel(aff);

    const boxX = 10;
    const boxY = viewHeight - 116;
    const boxW = viewWidth - 20;
    const boxH = 108;

    ctx.fillStyle = "rgba(10, 15, 28, 0.95)";
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);

    // NPC Portrait
    const sheet = this.world.culture.getNpcSpriteSheet(npc.profile);
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(boxX + 6, boxY + 6, 24, 24);
    ctx.drawImage(sheet, 0, 0, 16, 16, boxX + 10, boxY + 10, 16, 16);

    // Header
    ctx.font = "8px monospace";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#fde047";
    ctx.fillText(`${npc.profile.name.toUpperCase()} (${disp})`, boxX + 36, boxY + 7);

    ctx.fillStyle = "#e2e8f0";
    const lines = this.wrapText(this.message, 42);
    for (let i = 0; i < Math.min(2, lines.length); i++) {
      ctx.fillText(lines[i], boxX + 36, boxY + 18 + i * 9);
    }

    ctx.fillStyle = "#1e293b";
    ctx.fillRect(boxX + 6, boxY + 37, boxW - 12, 1);

    // Selectable List
    const listY = boxY + 41;
    if (this.mode === "menu") {
      for (let i = 0; i < this.options.length; i++) {
        const selected = i === this.selectedIndex;
        ctx.fillStyle = selected ? "#93c5fd" : "#94a3b8";
        ctx.fillText(`${selected ? ">" : " "} ${this.options[i].label}`, boxX + 10, listY + i * 9);
      }
    } else if (this.mode === "trade_sell") {
      const count = player.inventory.length + 1;
      for (let i = 0; i < count; i++) {
        const selected = i === this.selectedIndex;
        if (i === player.inventory.length) {
          ctx.fillStyle = selected ? "#93c5fd" : "#94a3b8";
          ctx.fillText(`${selected ? ">" : " "} Back`, boxX + 10, listY + i * 11);
        } else {
          const item = player.inventory[i];
          const price = this.getSellPrice(item, aff);
          const spr = this.artifacts.getSprite(item);
          ctx.drawImage(spr, boxX + 18, listY + i * 11 - 2, 10, 10);
          ctx.fillStyle = selected ? "#fde047" : "#cbd5e1";
          ctx.fillText(
            `${selected ? ">" : " "}   ${this.artifacts.getDisplayName(item)} (+${price}c)`,
            boxX + 10,
            listY + i * 11
          );
        }
      }
    } else if (this.mode === "trade_buy") {
      const count = this.tradeItems.length + 1;
      for (let i = 0; i < count; i++) {
        const selected = i === this.selectedIndex;
        if (i === this.tradeItems.length) {
          ctx.fillStyle = selected ? "#93c5fd" : "#94a3b8";
          ctx.fillText(`${selected ? ">" : " "} Back`, boxX + 10, listY + i * 11);
        } else {
          const item = this.tradeItems[i];
          const price = this.getBuyPrice(item, aff);
          const spr = this.artifacts.getSprite(item);
          ctx.drawImage(spr, boxX + 18, listY + i * 11 - 2, 10, 10);
          ctx.fillStyle = selected ? "#fde047" : "#cbd5e1";
          ctx.fillText(
            `${selected ? ">" : " "}   ${this.artifacts.getDisplayName(item)} (-${price}c)`,
            boxX + 10,
            listY + i * 11
          );
        }
      }
    }
  }

  wrapText(text, maxChars) {
    const words = text.split(" ");
    const lines = [];
    let current = "";
    for (const w of words) {
      if ((current + " " + w).trim().length <= maxChars) {
        current = (current + " " + w).trim();
      } else {
        lines.push(current);
        current = w;
      }
    }
    if (current) lines.push(current);
    return lines;
  }
}
