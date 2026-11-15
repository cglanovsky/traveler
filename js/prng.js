class SeededRandom {
  constructor(seed) {
    this.seed = seed >>> 0;
  }

  next() {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min, max) {
    return min + this.next() * (max - min);
  }

  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }
}

function hashCoords(seed, x, y) {
  let h = seed ^ (x * 374761393) ^ (y * 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

class ValueNoise2D {
  constructor(seed) {
    this.seed = seed >>> 0;
  }

  lattice(ix, iy) {
    return hashCoords(this.seed, ix, iy) / 4294967296;
  }

  fade(t) {
    return t * t * (3 - 2 * t);
  }

  lerp(a, b, t) {
    return a + (b - a) * t;
  }

  noise(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = this.fade(x - ix);
    const fy = this.fade(y - iy);

    const v00 = this.lattice(ix, iy);
    const v10 = this.lattice(ix + 1, iy);
    const v01 = this.lattice(ix, iy + 1);
    const v11 = this.lattice(ix + 1, iy + 1);

    const nx0 = this.lerp(v00, v10, fx);
    const nx1 = this.lerp(v01, v11, fx);
    return this.lerp(nx0, nx1, fy);
  }

  fbm(x, y, octaves = 4, persistence = 0.5, lacunarity = 2.0) {
    let total = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      total += this.noise(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    return total / maxValue;
  }
}
