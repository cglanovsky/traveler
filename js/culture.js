const PHONEMES = {
  stops: ["b", "c", "d", "g", "k", "p", "t"],
  fricatives: ["ç", "č", "f", "ğ", "h", "j", "s", "š", "ş", "v", "z", "ž"],
  liquids: ["l", "m", "ñ", "r", "ř", "w", "y"],
  allConsonants: [
    "b", "c", "ç", "d", "f", "g", "h", "j", "k", "l", "m", "ñ",
    "p", "r", "ř", "s", "š", "t", "ğ", "č", "v", "w", "y", "z", "ž", "ş"
  ],
  vowels: ["a", "ă", "å", "á", "e", "ē", "ā", "i", "ĩ", "í", "ö", "ō", "ü", "ū"]
};

const CULTURAL_PALETTES = {
  skin: ["#f5d0b5", "#e8b48a", "#d4956a", "#b57249", "#8d5232", "#5c341e"],
  hair: ["#1c1917", "#3f2a1d", "#713f12", "#b45309", "#d97706", "#e5e7eb", "#7f1d1d"],
  eyes: ["#1e293b", "#1d4ed8", "#15803d", "#78350f", "#6d28d9"],
  tunics: ["#b91c1c", "#1d4ed8", "#15803d", "#b45309", "#6d28d9", "#0f766e", "#475569", "#a16207"],
  footwear: ["#451a03", "#1e293b", "#78350f", "#57534e"],
  headgearColors: ["#dc2626", "#2563eb", "#d97706", "#059669", "#7c3aed", "#f8fafc", "#334155"],
  roofs: ["#991b1b", "#1e40af", "#92400e", "#065f46", "#5b21b6", "#374151"],
  walls: ["#e7e5e4", "#fde68a", "#fed7aa", "#cbd5e1", "#d6d3d1"]
};

class CultureEngine {
  constructor(worldSeed) {
    this.worldSeed = worldSeed;
    this.cultureCache = new Map();
    this.spriteCache = new Map();
  }

  getCultureId(tx, ty) {
    const regionX = Math.floor(tx / 96);
    const regionY = Math.floor(ty / 96);
    return `cult_${regionX}_${regionY}`;
  }

  getCultureVector(cultureId) {
    if (this.cultureCache.has(cultureId)) {
      return this.cultureCache.get(cultureId);
    }

    let seed = this.worldSeed;
    for (let i = 0; i < cultureId.length; i++) {
      seed = Math.imul(seed ^ cultureId.charCodeAt(i), 2654435761) >>> 0;
    }
    const rng = new SeededRandom(seed);

    const pickSubset = (arr, count) => {
      const copy = [...arr];
      const out = [];
      for (let i = 0; i < count && copy.length > 0; i++) {
        const idx = rng.int(0, copy.length - 1);
        out.push(copy.splice(idx, 1)[0]);
      }
      return out;
    };

    const vector = {
      id: cultureId,
      favoredConsonants: pickSubset(PHONEMES.allConsonants, 8),
      favoredVowels: pickSubset(PHONEMES.vowels, 5),
      syllableBias: pickSubset(["CV", "CVC", "V", "CVV", "CCV"], 3),
      skinPool: pickSubset(CULTURAL_PALETTES.skin, 3),
      hairPool: pickSubset(CULTURAL_PALETTES.hair, 3),
      eyePool: pickSubset(CULTURAL_PALETTES.eyes, 2),
      tunicPool: pickSubset(CULTURAL_PALETTES.tunics, 3),
      footwearPool: pickSubset(CULTURAL_PALETTES.footwear, 2),
      headgearStyle: rng.int(0, 3),
      headgearChance: rng.range(0.35, 0.85),
      headgearColorPool: pickSubset(CULTURAL_PALETTES.headgearColors, 2),
      facialHairChance: rng.range(0.2, 0.65),
      roofColor: CULTURAL_PALETTES.roofs[rng.int(0, CULTURAL_PALETTES.roofs.length - 1)],
      wallColor: CULTURAL_PALETTES.walls[rng.int(0, CULTURAL_PALETTES.walls.length - 1)]
    };

    this.cultureCache.set(cultureId, vector);
    return vector;
  }

  pickWeighted(rng, favoredPool, globalPool, localRatio = 0.75) {
    if (rng.next() < localRatio && favoredPool.length > 0) {
      return favoredPool[rng.int(0, favoredPool.length - 1)];
    }
    return globalPool[rng.int(0, globalPool.length - 1)];
  }

  generateWord(rng, culture, syllableCount) {
    let word = "";
    let lastChar = "";

    for (let s = 0; s < syllableCount; s++) {
      const template = this.pickWeighted(
        rng,
        culture.syllableBias,
        ["CV", "CVC", "V", "CVV", "CCV"],
        0.75
      );

      let syl = "";
      for (let i = 0; i < template.length; i++) {
        const slot = template[i];

        if (slot === "C") {
          let c = this.pickWeighted(rng, culture.favoredConsonants, PHONEMES.allConsonants, 0.75);
          if (word.length === 0 && syl.length === 0 && c === "ğ") {
            c = "g";
          }
          if (i > 0 && template[i - 1] === "C") {
            const stop = PHONEMES.stops[rng.int(0, PHONEMES.stops.length - 1)];
            const liquid = ["l", "r", "ř"][rng.int(0, 2)];
            syl = syl.slice(0, -1) + stop + liquid;
            lastChar = liquid;
            continue;
          }
          if (c === lastChar) {
            c = PHONEMES.liquids[rng.int(0, PHONEMES.liquids.length - 1)];
          }
          syl += c;
          lastChar = c;
        } else if (slot === "V") {
          let v = this.pickWeighted(rng, culture.favoredVowels, PHONEMES.vowels, 0.75);
          if (lastChar && PHONEMES.vowels.includes(lastChar) && rng.next() < 0.45) {
            syl += "‘";
          }
          syl += v;
          lastChar = v;
        }
      }

      if (
        s > 0 &&
        PHONEMES.vowels.includes(lastChar) &&
        syl.length > 0 &&
        ["l", "m", "ñ", "r", "ř"].includes(syl[0]) &&
        rng.next() < 0.25
      ) {
        word += "‘";
      }

      word += syl;
    }

    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  generateSettlementName(seed, culture) {
    const rng = new SeededRandom(seed);
    if (rng.next() < 0.35) {
      const part1 = this.generateWord(rng, culture, rng.int(1, 2));
      const part2 = this.generateWord(rng, culture, rng.int(1, 2)).toLowerCase();
      return `${part1}-${part2}`;
    }
    return this.generateWord(rng, culture, rng.int(2, 3));
  }

  generateNpcName(seed, culture) {
    const rng = new SeededRandom(seed);
    return this.generateWord(rng, culture, rng.int(1, 3));
  }

  generateNpcProfile(seed, culture, role = "villager") {
    const rng = new SeededRandom(seed);
    const name = this.generateNpcName(seed + 17, culture);

    const skin = this.pickWeighted(rng, culture.skinPool, CULTURAL_PALETTES.skin, 0.7);
    const hair = this.pickWeighted(rng, culture.hairPool, CULTURAL_PALETTES.hair, 0.7);
    const eyes = this.pickWeighted(rng, culture.eyePool, CULTURAL_PALETTES.eyes, 0.7);
    const tunic = role === "boatkeeper"
      ? "#d97706"
      : this.pickWeighted(rng, culture.tunicPool, CULTURAL_PALETTES.tunics, 0.8);
    const footwear = this.pickWeighted(rng, culture.footwearPool, CULTURAL_PALETTES.footwear, 0.8);

    const hasFacialHair = rng.next() < culture.facialHairChance;
    const hasHeadgear = role === "boatkeeper" ? true : rng.next() < culture.headgearChance;
    const headgearStyle = rng.next() < 0.8 ? culture.headgearStyle : rng.int(1, 3);
    const headgearColor = role === "boatkeeper"
      ? "#1e3a8a"
      : this.pickWeighted(rng, culture.headgearColorPool, CULTURAL_PALETTES.headgearColors, 0.8);

    const appearanceKey = [
      skin, hair, eyes, tunic, footwear,
      hasFacialHair ? 1 : 0,
      hasHeadgear ? headgearStyle : 0,
      headgearColor
    ].join("|");

    return {
      name,
      role,
      cultureId: culture.id,
      skin,
      hair,
      eyes,
      tunic,
      footwear,
      hasFacialHair,
      hasHeadgear,
      headgearStyle,
      headgearColor,
      appearanceKey
    };
  }

  getNpcSpriteSheet(profile) {
    if (this.spriteCache.has(profile.appearanceKey)) {
      return this.spriteCache.get(profile.appearanceKey);
    }

    const sheet = document.createElement("canvas");
    sheet.width = 64;
    sheet.height = 32;
    const sctx = sheet.getContext("2d");

    const dirs = ["down", "up", "left", "right"];

    for (let d = 0; d < dirs.length; d++) {
      const dir = dirs[d];
      for (let frame = 0; frame < 2; frame++) {
        const ox = d * 16;
        const oy = frame * 16;
        const bob = frame === 1 ? 1 : 0;

        // Shadow
        sctx.fillStyle = "rgba(0, 0, 0, 0.32)";
        sctx.fillRect(ox + 3, oy + 13, 10, 3);

        // Layer 1: Base Neck / Hands (Skin)
        sctx.fillStyle = profile.skin;
        sctx.fillRect(ox + 3, oy + 8 + bob, 10, 3);

        // Layer 2: Footwear
        sctx.fillStyle = profile.footwear;
        sctx.fillRect(ox + 4, oy + 12 - bob, 3, 3);
        sctx.fillRect(ox + 9, oy + 12 + (bob ? 0 : -1), 3, 3);

        // Layer 3: Clothing / Tunic
        sctx.fillStyle = profile.tunic;
        sctx.fillRect(ox + 4, oy + 7, 8, 6);

        // Layer 1b: Head (Skin)
        sctx.fillStyle = profile.skin;
        sctx.fillRect(ox + 4, oy + 2, 8, 6);

        // Layer 4: Eyes
        sctx.fillStyle = profile.eyes;
        if (dir === "down") {
          sctx.fillRect(ox + 5, oy + 5, 2, 2);
          sctx.fillRect(ox + 9, oy + 5, 2, 2);
        } else if (dir === "left") {
          sctx.fillRect(ox + 4, oy + 5, 2, 2);
        } else if (dir === "right") {
          sctx.fillRect(ox + 10, oy + 5, 2, 2);
        }

        // Layer 5: Hair
        sctx.fillStyle = profile.hair;
        if (dir === "up") {
          sctx.fillRect(ox + 4, oy + 2, 8, 5);
        } else if (dir === "left") {
          sctx.fillRect(ox + 7, oy + 2, 5, 5);
          sctx.fillRect(ox + 4, oy + 2, 8, 2);
        } else if (dir === "right") {
          sctx.fillRect(ox + 4, oy + 2, 5, 5);
          sctx.fillRect(ox + 4, oy + 2, 8, 2);
        } else {
          sctx.fillRect(ox + 4, oy + 2, 8, 2);
          sctx.fillRect(ox + 4, oy + 3, 1, 3);
          sctx.fillRect(ox + 11, oy + 3, 1, 3);
        }

        // Layer 6: Facial Hair
        if (profile.hasFacialHair && dir !== "up") {
          sctx.fillStyle = profile.hair;
          if (dir === "down") {
            sctx.fillRect(ox + 5, oy + 7, 6, 2);
          } else if (dir === "left") {
            sctx.fillRect(ox + 4, oy + 7, 4, 2);
          } else if (dir === "right") {
            sctx.fillRect(ox + 8, oy + 7, 4, 2);
          }
        }

        // Layer 7: Headgear
        if (profile.hasHeadgear && profile.headgearStyle > 0) {
          sctx.fillStyle = profile.headgearColor;
          if (profile.headgearStyle === 1) {
            // Bandana / Cap
            sctx.fillRect(ox + 3, oy + 1, 10, 2);
          } else if (profile.headgearStyle === 2) {
            // Wide-brim sun hat
            sctx.fillRect(ox + 2, oy + 2, 12, 1);
            sctx.fillRect(ox + 4, oy + 0, 8, 2);
          } else {
            // Hood / Turban wrap
            sctx.fillRect(ox + 3, oy + 1, 10, 3);
            sctx.fillRect(ox + 5, oy + 0, 6, 1);
          }
        }
      }
    }

    this.spriteCache.set(profile.appearanceKey, sheet);
    return sheet;
  }
}
