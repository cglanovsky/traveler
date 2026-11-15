class CombatSystem {
  constructor(world, interior, dialogue, artifactEngine, storage) {
    this.world = world;
    this.interior = interior;
    this.dialogue = dialogue;
    this.artifacts = artifactEngine;
    this.storage = storage;

    this.swingTimer = 0;
    this.cooldownTimer = 0;
    this.hitThisSwing = new Set();
    this.playerInvuln = 0;
    this.playerKnockX = 0;
    this.playerKnockY = 0;
  }

  getPlayerDamage(player) {
    return 1 + Math.floor(player.combatKills / 3);
  }

  getCooldownDuration(player) {
    return Math.max(0.18, 0.34 - player.combatKills * 0.012);
  }

  triggerAttack(player) {
    if (player.inBoat || player.hp <= 0) return false;
    if (this.cooldownTimer > 0 || this.swingTimer > 0) return false;

    this.swingTimer = 0.16;
    this.cooldownTimer = this.getCooldownDuration(player);
    this.hitThisSwing.clear();
    return true;
  }

  getSwordBox(player) {
    const reach = 14;
    const size = 14;
    let x = player.x - size / 2;
    let y = player.y - size / 2;

    if (player.facing === "up") y -= reach;
    else if (player.facing === "down") y += reach;
    else if (player.facing === "left") x -= reach;
    else if (player.facing === "right") x += reach;

    return { x, y, w: size, h: size };
  }

  boxesOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  update(dt, player, onBanner) {
    if (this.swingTimer > 0) this.swingTimer = Math.max(0, this.swingTimer - dt);
    if (this.cooldownTimer > 0) this.cooldownTimer = Math.max(0, this.cooldownTimer - dt);
    if (this.playerInvuln > 0) this.playerInvuln = Math.max(0, this.playerInvuln - dt);

    if (Math.abs(this.playerKnockX) > 0.5 || Math.abs(this.playerKnockY) > 0.5) {
      const mode = this.interior.activeRoom ? "interior" : "land";
      const nx = player.x + this.playerKnockX * dt;
      const ny = player.y + this.playerKnockY * dt;
      if (this.canEntityMove(nx, player.y, mode)) player.x = nx;
      if (this.canEntityMove(player.x, ny, mode)) player.y = ny;
      this.playerKnockX *= 0.82;
      this.playerKnockY *= 0.82;
    }

    const activeNpcs = this.interior.activeRoom
      ? this.interior.activeRoom.residents
      : Array.from(this.world.npcs.values());

    if (this.swingTimer > 0) {
      const sword = this.getSwordBox(player);
      const dmg = this.getPlayerDamage(player);

      for (let i = activeNpcs.length - 1; i >= 0; i--) {
        const npc = activeNpcs[i];
        if (npc.dead || this.hitThisSwing.has(npc.id)) continue;

        const npcBox = { x: npc.x - 6, y: npc.y - 6, w: 12, h: 12 };
        if (this.boxesOverlap(sword, npcBox)) {
          this.hitThisSwing.add(npc.id);
          this.damageNpc(npc, dmg, player, onBanner);
        }
      }
    }

    // Hostile AI pursuit and contact damage
    for (const npc of activeNpcs) {
      if (npc.dead) continue;

      if (npc.flashTimer > 0) npc.flashTimer = Math.max(0, npc.flashTimer - dt);
      if (npc.attackCooldown > 0) npc.attackCooldown = Math.max(0, npc.attackCooldown - dt);

      if (Math.abs(npc.knockX || 0) > 0.5 || Math.abs(npc.knockY || 0) > 0.5) {
        const mode = this.interior.activeRoom ? "interior" : "land";
        const nx = npc.x + npc.knockX * dt;
        const ny = npc.y + npc.knockY * dt;
        if (this.canEntityMove(nx, npc.y, mode)) npc.x = nx;
        if (this.canEntityMove(npc.x, ny, mode)) npc.y = ny;
        npc.knockX *= 0.82;
        npc.knockY *= 0.82;
      }

      if (!npc.hostile || player.inBoat) continue;

      const dx = player.x - npc.x;
      const dy = player.y - npc.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 96 && dist > 10) {
        const speed = npc.chaseSpeed || 42;
        const mx = (dx / dist) * speed * dt;
        const my = (dy / dist) * speed * dt;
        const mode = this.interior.activeRoom ? "interior" : "land";

        if (this.canEntityMove(npc.x + mx, npc.y, mode)) npc.x += mx;
        if (this.canEntityMove(npc.x, npc.y + my, mode)) npc.y += my;

        npc.walkTimer = (npc.walkTimer || 0) + dt * 7;
        if (Math.abs(dx) > Math.abs(dy)) {
          npc.facing = dx > 0 ? "right" : "left";
        } else {
          npc.facing = dy > 0 ? "down" : "up";
        }
      }

      if (dist <= 13 && this.playerInvuln <= 0 && (npc.attackCooldown || 0) <= 0) {
        npc.attackCooldown = 0.85;
        this.playerInvuln = 0.75;
        player.hp = Math.max(0, player.hp - 1);

        const pushLen = Math.max(1, dist);
        this.playerKnockX = (dx / pushLen) * 140;
        this.playerKnockY = (dy / pushLen) * 140;
        onBanner("HIT BY ENEMY! (-1 HEART)", 1.4);
      }
    }
  }

  canEntityMove(x, y, mode) {
    const tx = Math.floor(x / TILE_SIZE);
    const ty = Math.floor(y / TILE_SIZE);
    if (mode === "interior") return this.interior.isWalkable(tx, ty);
    return this.world.isLandWalkable(tx, ty) && this.world.getTile(tx, ty) !== TILES.DOOR;
  }

  damageNpc(npc, dmg, player, onBanner) {
    npc.hp = Math.max(0, npc.hp - dmg);
    npc.flashTimer = 0.16;

    const dx = npc.x - player.x;
    const dy = npc.y - player.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    npc.knockX = (dx / len) * 130;
    npc.knockY = (dy / len) * 130;

    if (!npc.hostile) {
      npc.hostile = true;
      npc.chaseSpeed = 44;
      this.dialogue.shiftAffinity(npc, -60);
      if (this.interior.activeRoom) {
        for (const res of this.interior.activeRoom.residents) {
          res.hostile = true;
          res.chaseSpeed = 44;
        }
      }
    }

    if (npc.hp <= 0) {
      this.handleNpcDeath(npc, player, onBanner);
    }
  }

  handleNpcDeath(npc, player, onBanner) {
    npc.dead = true;
    this.storage.deadNpcs.add(npc.id);
    player.combatKills += 1;

    // Unlock boat if this NPC was guarding one
    if (npc.guardingBoatId) {
      const boat = this.world.boats.get(npc.guardingBoatId);
      if (boat) {
        boat.guarded = false;
        this.storage.unlockedBoats.add(boat.id);
      }
    }

    // Loot coins & any artifacts held by the NPC
    const lootCoins = 6 + (npc.segments || 1) * 5;
    player.coins += lootCoins;

    const culture = this.world.culture.getCultureVector(npc.cultureId || "cult_0_0");
    const npcInv = this.artifacts.getNpcInventory(
      npc.id,
      hashCoords(this.world.seed, npc.id.length, 77),
      culture
    );
    let lootedArtCount = 0;
    while (npcInv.length > 0) {
      player.inventory.push(npcInv.pop());
      lootedArtCount++;
    }

    // Apply regional reputation spillover if civilian / resident killed
    if (npc.role === "resident" || npc.role === "villager") {
      this.dialogue.applyViolencePenalty(npc);
      const artMsg = lootedArtCount > 0 ? ` + ${lootedArtCount} ARTIFACT` : "";
      onBanner(`SLAIN ${npc.profile.name.toUpperCase()} (+${lootCoins}c${artMsg}) - REP DROPPED!`, 3.0);
    } else {
      const artMsg = lootedArtCount > 0 ? ` + ${lootedArtCount} ARTIFACT` : "";
      onBanner(`DEFEATED ${npc.profile.name.toUpperCase()} (+${lootCoins}c${artMsg})`, 2.4);
    }

    if (this.interior.activeRoom) {
      this.interior.activeRoom.residents = this.interior.activeRoom.residents.filter((r) => !r.dead);
    } else {
      this.world.npcs.delete(npc.id);
    }
  }

  renderSword(ctx, playerScreenX, playerScreenY, facing) {
    if (this.swingTimer <= 0) return;

    const px = Math.round(playerScreenX);
    const py = Math.round(playerScreenY);

    ctx.fillStyle = "#e2e8f0";
    if (facing === "up") {
      ctx.fillRect(px - 1, py - 18, 3, 11);
      ctx.fillStyle = "#fbbf24";
      ctx.fillRect(px - 3, py - 8, 7, 2);
    } else if (facing === "down") {
      ctx.fillRect(px - 1, py + 7, 3, 11);
      ctx.fillStyle = "#fbbf24";
      ctx.fillRect(px - 3, py + 6, 7, 2);
    } else if (facing === "left") {
      ctx.fillRect(px - 18, py - 1, 11, 3);
      ctx.fillStyle = "#fbbf24";
      ctx.fillRect(px - 8, py - 3, 2, 7);
    } else if (facing === "right") {
      ctx.fillRect(px + 7, py - 1, 11, 3);
      ctx.fillStyle = "#fbbf24";
      ctx.fillRect(px + 6, py - 3, 2, 7);
    }
  }

  renderHealthBar(ctx, npc, screenX, screenY) {
    if (npc.dead) return;
    if (!npc.hostile && npc.hp >= npc.maxHp) return;

    const totalWidth = 24;
    const height = 4;
    const bx = Math.round(screenX - totalWidth / 2);
    const by = Math.round(screenY - 14);

    ctx.fillStyle = "#090d16";
    ctx.fillRect(bx - 1, by - 1, totalWidth + 2, height + 2);

    const ratio = Math.max(0, npc.hp / npc.maxHp);
    const fillW = Math.round(totalWidth * ratio);
    ctx.fillStyle = npc.hostile ? "#ef4444" : "#22c55e";
    ctx.fillRect(bx, by, fillW, height);

    // Fixed-width bar divided into N segments indicating difficulty
    const segments = Math.max(1, npc.segments || 2);
    if (segments > 1) {
      ctx.fillStyle = "#090d16";
      for (let s = 1; s < segments; s++) {
        const divX = bx + Math.round((totalWidth * s) / segments);
        ctx.fillRect(divX, by, 1, height);
      }
    }
  }
}
