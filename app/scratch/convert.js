// scratch/convert.js
function oklchToOklab(L, C, h) {
  const hRad = (h * Math.PI) / 180;
  return {
    L,
    a: C * Math.cos(hRad),
    b: C * Math.sin(hRad),
  };
}

function oklabToLms(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  return {
    l: l_ * l_ * l_,
    m: m_ * m_ * m_,
    s: s_ * s_ * s_,
  };
}

function lmsToLinearSrgb(l, m, s) {
  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return { r, g, b };
}

function linearSrgbToSrgb(c) {
  if (c <= 0.0031308) {
    return 12.92 * c;
  }
  return 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function convertOklchToHex(L, C, h) {
  const oklab = oklchToOklab(L, C, h);
  const lms = oklabToLms(oklab.L, oklab.a, oklab.b);
  const linear = lmsToLinearSrgb(lms.l, lms.m, lms.s);

  // Clamp to [0, 1]
  const r = Math.min(1, Math.max(0, linearSrgbToSrgb(linear.r)));
  const g = Math.min(1, Math.max(0, linearSrgbToSrgb(linear.g)));
  const b = Math.min(1, Math.max(0, linearSrgbToSrgb(linear.b)));

  const rHex = Math.round(r * 255).toString(16).padStart(2, '0');
  const gHex = Math.round(g * 255).toString(16).padStart(2, '0');
  const bHex = Math.round(b * 255).toString(16).padStart(2, '0');

  return `#${rHex}${gHex}${bHex}`;
}

console.log("oklch(0.55 0.2 250) ->", convertOklchToHex(0.55, 0.2, 250));
console.log("oklch(0.65 0.2 250) ->", convertOklchToHex(0.65, 0.2, 250));
console.log("oklch(0.985 0 0) ->", convertOklchToHex(0.985, 0, 0));
console.log("oklch(0.145 0 0) ->", convertOklchToHex(0.145, 0, 0));
