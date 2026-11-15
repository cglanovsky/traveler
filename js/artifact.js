const ARTIFACT_PALETTES = [
  ["#92400e", "#d97706", "#fbbf24", "#fef3c7"],
  ["#1e3a8a", "#2563eb", "#60a5fa", "#dbeafe"],
  ["#065f46", "#059669", "#34d399", "#d1fae5"],
  ["#7f1d1d", "#dc2626", "#f87171", "#fee2e2"],
  ["#4c1d95", "#7c3aed", "#a78bfa", "#ede9fe"],
  ["#334155", "#64748b", "#cbd5e1", "#f8fafc"],
  ["#701a75", "#c026d3", "#e879f9", "#fae8ff"]
];

const ARTIFACT_NOUNS = [
  "Idol", "Chalice", "Mask", "Relic", "Seal", "Prism", "Totem", "Crown", "Tablet", "Orb"
];

class ArtifactEngine {
  constructor(worldSeed) {
    this.worldSeed = worldSeed;
    this.spriteCache = new Map();
    this.npcInventories = new Map();
  }

  generateArtifact(seed, culture = null) {
    const rng = new SeededRandom(seed);
    const id = `art_${seed >>> 0}`;

    const roll = rng.next();
    let symmetry = "horizontal";
    if (roll < 0.40) symmetry = "horizontal";
    else if (roll < 0.60) symmetry = "radial";
    else if (roll < 0.70) symmetry = "vertical";
    else if (roll < 0.90) symmetry = "near";
    else symmetry = "asymmetric";

    const palette = ARTIFACT_PALETTES[rng.int(0, ARTIFACT_PALETTES.length - 1)];
    const size = 12;
    const grid = new Uint8Array(size * size);

    const setPx = (x, y, val) => {
      if (x >= 1 && x < size - 1 && y >= 1 && y < size - 1) {
        grid[y * size + x] = val;
      }
    };

    if (symmetry === "horizontal" || symmetry === "near") {
      for (let y = 2; y < size - 2; y++) {
        for (let x = 2; x < size / 2; x++) {
          const centerBias = 1 - Math.abs(y - 5.5) / 6;
          if (rng.next() < 0.42 + centerBias * 0.25) {
            const shade = rng.next() < 0.2 ? 3 : rng.next() < 0.55 ? 2 : 1;
            setPx(x, y, shade);
            setPx(size - 1 - x, y, shade);
          }
        }
      }
      if (symmetry === "near") {
        const ax = rng.int(2, size - 3);
        const ay = rng.int(2, size - 3);
        setPx(ax, ay, 4);
        setPx(ax + 1, ay, 3);
      }
    } else if (symmetry === "vertical") {
      for (let y = 2; y < size / 2; y++) {
        for (let x = 2; x < size - 2; x++) {
          if (rng.next() < 0.52) {
            const shade = rng.next() < 0.25 ? 3 : 2;
            setPx(x, y, shade);
            setPx(x, size - 1 - y, shade);
          }
        }
      }
    } else if (symmetry === "radial") {
      for (let y = 2; y < size / 2; y++) {
        for (let x = 2; x < size / 2; x++) {
          if (rng.next() < 0.56) {
            const shade = x === y ? 4 : rng.next() < 0.35 ? 3 : 2;
            setPx(x, y, shade);
            setPx(size - 1 - x, y, shade);
            setPx(x, size - 1 - y, shade);
            setPx(size - 1 - x, size - 1 - y, shade);
          }
        }
      }
    } else {
      let wx = 5;
      let wy = 5;
      for (let step = 0; step < 34; step++) {
        const shade = step % 7 === 0 ? 4 : rng.next() < 0.35 ? 3 : 2;
        setPx(wx, wy, shade);
        wx = Math.max(2, Math.min(size - 3, wx + rng.int(-1, 1)));
        wy = Math.max(2, Math.min(size - 3, wy + rng.int(-1, 1)));
      }
    }

    // Ensure non-empty core
    setPx(5, 5, 3);
    setPx(6, 5, 2);
    setPx(5, 6, 2);
    setPx(6, 6, 4);

    // 1-pixel dark outline (#111111 represented as value 5)
    const outlined = new Uint8Array(grid);
    let pixelCount = 0;
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        if (grid[y * size + x] > 0) {
          pixelCount++;
          continue;
        }
        const hasNeighbor =
          grid[(y - 1) * size + x] > 0 ||
          grid[(y + 1) * size + x] > 0 ||
          grid[y * size + (x - 1)] > 0 ||
          grid[y * size + (x + 1)] > 0;
        if (hasNeighbor) {
          outlined[y * size + x] = 5;
        }
      }
    }

    const noun = ARTIFACT_NOUNS[rng.int(0, ARTIFACT_NOUNS.length - 1)];
    const defaultName = culture
      ? `${culture.id.replace("cult_", "Isle ")} ${noun}`
      : `Ancient ${noun}`;

    const rarityBonus = symmetry === "asymmetric" || symmetry === "radial" ? 45 : 15;
    const baseValue = Math.max(15, Math.min(450, pixelCount * 3 + rarityBonus + rng.int(5, 40)));

    return {
      id,
      seed,
      symmetry,
      palette,
      pixels: Array.from(outlined),
      name: defaultName,
      customName: null,
      baseValue
    };
  }

  getDisplayName(artifact) {
    return artifact.customName && artifact.customName.trim().length > 0
      ? artifact.customName.trim()
      : artifact.name;
  }

  getSprite(artifact) {
    if (this.spriteCache.has(artifact.id)) {
      return this.spriteCache.get(artifact.id);
    }

    const size = 12;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const sctx = c.getContext("2d");

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const val = artifact.pixels[y * size + x];
        if (val === 0) continue;
        if (val === 5) {
          sctx.fillStyle = "#0f172a";
        } else {
          sctx.fillStyle = artifact.palette[val - 1] || artifact.palette[0];
        }
        sctx.fillRect(x, y, 1, 1);
      }
    }

    this.spriteCache.set(artifact.id, c);
    return c;
  }

  getNpcInventory(npcId, seed, culture) {
    if (this.npcInventories.has(npcId)) {
      return this.npcInventories.get(npcId);
    }
    const rng = new SeededRandom(seed);
    const items = [];
    if (rng.next() < 0.65) {
      items.push(this.generateArtifact(seed + 101, culture));
    }
    if (rng.next() < 0.25) {
      items.push(this.generateArtifact(seed + 202, culture));
    }
    this.npcInventories.set(npcId, items);
    return items;
  }
}
