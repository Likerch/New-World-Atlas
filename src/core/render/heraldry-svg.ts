// A coat of arms as SVG on a 200 × 220 shield: the field and its division, the ordinary, the charges, a soft light
// from the upper left and a dark rim. Charges are drawn in a 100 × 100 box and set where the ordinary leaves room.
import type { ChargeKind, CoatOfArms, Division, Ordinary, ShieldShape, Tincture } from "../heraldry";

export const TINCTURE: Record<Tincture, string> = { or: "#e3b22b", argent: "#f3f1ea", gules: "#c0272d", azure: "#2457a6", vert: "#25793d", purpure: "#6e3482", sable: "#222222" };

const SHIELD: Record<ShieldShape, string> = {
  heater: "M10,10H190V95C190,160 140,198 100,214C60,198 10,160 10,95Z",
  french: "M10,10H190V160C190,184 150,192 122,198L100,214L78,198C50,192 10,184 10,160Z",
  spanish: "M10,10H190V125A90,90 0 0 1 10,125Z",
  round: "M100,12A98,98 0 1 1 99.9,12Z",
  kite: "M100,8C160,8 190,40 190,82C190,140 132,188 100,214C68,188 10,140 10,82C10,40 40,8 100,8Z",
};

const r1 = (value: number) => Math.round(value * 10) / 10;
const poly = (points: [number, number][]) => `M${points.map(([x, y]) => `${r1(x)},${r1(y)}`).join("L")}Z`;
const circle = (x: number, y: number, r: number) => `M${x - r},${y}a${r},${r} 0 1 0 ${r * 2},0a${r},${r} 0 1 0 ${-r * 2},0Z`;

function division(kind: Division): string {
  switch (kind) {
    case "plain":
      return "";
    case "perPale":
      return "M100,0H200V220H100Z";
    case "perFess":
      return "M0,110H200V220H0Z";
    case "perBend":
      return "M0,0L200,220H0Z";
    case "perBendSinister":
      return "M200,0L0,220H200Z";
    case "perChevron":
      return "M0,220L100,95L200,220Z";
    case "perSaltire":
      return "M0,0L100,110L200,0ZM0,220L100,110L200,220Z";
    case "quarterly":
      return "M100,0H200V110H100ZM0,110H100V220H0Z";
    case "gyronny": {
      const rim = (k: number): [number, number] => {
        const angle = (k * Math.PI) / 4 - Math.PI / 2;
        return [100 + Math.cos(angle) * 300, 110 + Math.sin(angle) * 300];
      };
      return [0, 2, 4, 6].map((k) => poly([[100, 110], rim(k), rim(k + 1)])).join("");
    }
    case "paly":
      return [1, 3, 5].map((k) => `M${r1((k * 200) / 6)},0h${r1(200 / 6)}V220h${r1(-200 / 6)}Z`).join("");
    case "barry":
      return [1, 3, 5].map((k) => `M0,${r1((k * 220) / 6)}H200v${r1(220 / 6)}H0Z`).join("");
    case "bendy":
      return [-4, -2, 0, 2, 4].map((k) => poly([[k * 40, 0], [k * 40 + 40, 0], [k * 40 + 260, 220], [k * 40 + 220, 220]])).join("");
    case "chequy": {
      let d = "";
      for (let row = 0; row < 6; row++) for (let col = 0; col < 5; col++) if ((row + col) % 2) d += `M${col * 40},${r1(row * 36.7)}h40v36.7h-40Z`;
      return d;
    }
  }
}

function ordinary(kind: Ordinary): string {
  switch (kind) {
    case "none":
    case "bordure":
      return "";
    case "fess":
      return "M0,80H200V140H0Z";
    case "pale":
      return "M70,0H130V220H70Z";
    case "bend":
      return "M-20,12L12,-20L220,188L188,220Z";
    case "chevron":
      return "M0,170L100,72L200,170V212L100,114L0,212Z";
    case "cross":
      return "M80,0H120V88H200V128H120V220H80V128H0V88H80Z";
    case "saltire":
      return "M-20,12L12,-20L220,188L188,220ZM220,12L188,-20L-20,188L12,220Z";
    case "chief":
      return "M0,0H200V66H0Z";
    case "pall":
      return "M0,0H34L100,74L166,0H200V34L120,106V220H80V106L0,34Z";
    case "pile":
      return "M50,0H150L100,170Z";
  }
}

/** Where the charges go, [x, y, size], given the ordinary and how many there are. */
function places(kind: Ordinary, count: number): [number, number, number][] {
  if (kind === "chief") return Array.from({ length: count }, (_, k) => [(200 * (k + 1)) / (count + 1), 34, count === 1 ? 46 : 38]);
  if (kind === "fess") return count === 1 ? [[100, 175, 48]] : count === 2 ? [[58, 42, 40], [142, 42, 40]] : [[55, 42, 40], [145, 42, 40], [100, 176, 44]];
  if (kind === "chevron") return [[52, 50, 40], [148, 50, 40], [100, 172, 44]].slice(0, count) as [number, number, number][];
  if (kind === "pale") return [[40, 105, 42], [160, 105, 42]].slice(0, count) as [number, number, number][];
  if (kind === "bend") return [[150, 58, 46], [52, 160, 46]].slice(0, count) as [number, number, number][];
  if (kind !== "none" && kind !== "bordure") return [[100, kind === "pile" ? 70 : 108, 40]];
  const small = kind === "bordure" ? 0.82 : 1;
  if (count === 1) return [[100, 104, 124 * small]];
  if (count === 2) return [[60, 98, 70 * small], [140, 98, 70 * small]];
  return [[58, 70, 62 * small], [142, 70, 62 * small], [100, 152, 62 * small]];
}

/** A charge in its 100 × 100 box: path data, plus any holes (drawn even-odd). */
function charge(kind: ChargeKind): string {
  switch (kind) {
    case "mullet":
      return `<path d="${poly(Array.from({ length: 10 }, (_, k): [number, number] => {
        const angle = (k * Math.PI) / 5 - Math.PI / 2;
        const r = k % 2 ? 19 : 48;
        return [50 + Math.cos(angle) * r, 54 + Math.sin(angle) * r];
      }))}"/>`;
    case "crescent":
      return `<path d="M15,40A38,38 0 1 0 85,40A42,42 0 0 1 15,40Z"/>`;
    case "sun": {
      const rays = Array.from({ length: 16 }, (_, k) => {
        const angle = (k * Math.PI) / 8;
        const reach = k % 2 ? 38 : 48;
        return poly([[50 + Math.cos(angle - 0.12) * 22, 50 + Math.sin(angle - 0.12) * 22], [50 + Math.cos(angle) * reach, 50 + Math.sin(angle) * reach], [50 + Math.cos(angle + 0.12) * 22, 50 + Math.sin(angle + 0.12) * 22]]);
      }).join("");
      return `<path d="${rays}"/><path d="${circle(50, 50, 24)}"/>`;
    }
    case "crossPattee":
      return `<path d="M40,8H60L55,40L60,45L92,40V60L60,55L55,60L60,92H40L45,60L40,55L8,60V40L40,45L45,40Z"/>`;
    case "tower":
      return `<path fill-rule="evenodd" d="M22,92V40H18V20H29V28H39V20H46V28H54V20H61V28H71V20H82V40H78V92ZM42,92V74A8,8 0 0 1 58,74V92ZM46,46H54V58H46Z"/>`;
    case "crown":
      return `<path d="M16,80L12,36L32,56L50,26L68,56L88,36L84,80Z"/><path d="M14,84H86V94H14Z"/><path d="${circle(12, 32, 5)}${circle(50, 21, 5.5)}${circle(88, 32, 5)}"/>`;
    case "key":
      return `<path fill-rule="evenodd" d="${circle(50, 24, 16)}${circle(50, 24, 8)}"/><path d="M46,39H54V93H46Z"/><path d="M54,68H70V76H63V82H70V93H54Z"/>`;
    case "sword":
      return `<path d="M46,24L50,5L54,24V70H46Z"/><path d="M28,70H72V78H28Z"/><path d="M47,78H53V90H47Z"/><path d="${circle(50, 93, 5)}"/>`;
    case "tree":
      return `<path d="M45,94V58H55V94Z"/><path d="${circle(50, 32, 22)}${circle(32, 50, 16)}${circle(68, 50, 16)}"/>`;
    case "fleur":
      return (
        `<path d="M50,6C63,22 64,42 50,62C36,42 37,22 50,6Z"/>` +
        `<path d="M46,58C30,62 12,52 14,34C16,22 32,22 31,34C26,31 22,37 26,43C30,50 40,50 46,46Z"/>` +
        `<path d="M54,58C70,62 88,52 86,34C84,22 68,22 69,34C74,31 78,37 74,43C70,50 60,50 54,46Z"/>` +
        `<path d="M26,58H74V67H26Z"/><path d="M44,67L38,90C46,85 54,85 62,90L56,67Z"/>`
      );
    case "eagle":
      return (
        `<path d="M44,56L8,18L13,31L5,35L15,43L8,49L20,55L14,62Z"/><path d="M56,56L92,18L87,31L95,35L85,43L92,49L80,55L86,62Z"/>` +
        `<path d="M43,28C43,19 57,19 57,28L59,64L50,72L41,64Z"/><path d="${circle(50, 16, 7.5)}"/><path d="M56,14L66,18L56,21Z"/>` +
        `<path d="M43,66L34,92L50,83L66,92L57,66Z"/>`
      );
    case "fish":
      return `<path d="M10,50C24,28 64,28 76,50C64,72 24,72 10,50Z"/><path d="M73,50L95,32L90,50L95,68Z"/><path d="${circle(25, 46, 3.5)}" fill="#222" stroke="none"/>`;
    case "anchor":
      return (
        `<path fill-rule="evenodd" d="${circle(50, 13, 9)}${circle(50, 13, 4.5)}"/><path d="M46.5,21H53.5V86H46.5Z"/><path d="M30,30H70V37H30Z"/>` +
        `<path d="M14,62C16,84 40,94 50,94C60,94 84,84 86,62L77,68C73,80 62,86 50,86C38,86 27,80 23,68Z"/><path d="M8,66L15,54L22,66Z"/><path d="M78,66L85,54L92,66Z"/>`
      );
    case "mountain":
      return `<path d="M4,92L30,42L42,58L54,20L72,56L80,44L96,92Z"/>`;
    case "wheel": {
      const spokes = Array.from({ length: 8 }, (_, k) => {
        const angle = (k * Math.PI) / 4;
        const [c, s] = [Math.cos(angle), Math.sin(angle)];
        return poly([[50 + c * 6 - s * 2.5, 50 + s * 6 + c * 2.5], [50 + c * 36 - s * 2.5, 50 + s * 36 + c * 2.5], [50 + c * 36 + s * 2.5, 50 + s * 36 - c * 2.5], [50 + c * 6 + s * 2.5, 50 + s * 6 - c * 2.5]]);
      }).join("");
      return `<path fill-rule="evenodd" d="${circle(50, 50, 44)}${circle(50, 50, 34)}"/><path d="${spokes}"/><path d="${circle(50, 50, 9)}"/>`;
    }
    case "roundel":
      return `<path d="${circle(50, 50, 40)}"/>`;
    case "lozenge":
      return `<path d="M50,6L82,50L50,94L18,50Z"/>`;
    case "annulet":
      return `<path fill-rule="evenodd" d="${circle(50, 50, 40)}${circle(50, 50, 27)}"/>`;
    case "hammer":
      return `<path d="M20,12H80V36H20Z"/><path d="M45,36H55V94H45Z"/>`;
    case "heart":
      return `<path d="M50,90C20,68 6,50 12,31C18,14 42,12 50,30C58,12 82,14 88,31C94,50 80,68 50,90Z"/>`;
    case "bell":
      return `<path d="M50,12C38,12 32,22 32,36C32,58 26,70 14,80H86C74,70 68,58 68,36C68,22 62,12 50,12Z"/><path d="${circle(50, 88, 7)}"/><path fill-rule="evenodd" d="${circle(50, 8, 6)}${circle(50, 8, 3)}"/>`;
    case "horseshoe":
      return `<path d="M20,16C10,52 20,92 50,92C80,92 90,52 80,16H65C71,48 66,77 50,77C34,77 29,48 35,16Z"/>`;
    case "ship":
      return `<path d="M8,62H92L78,86H22Z"/><path d="M48,10H52V62H48Z"/><path d="M55,15C72,26 74,46 55,57Z"/><path d="M45,19C30,30 28,46 45,55Z"/><path d="M52,10L66,14L52,18Z"/>`;
  }
}

/** A cheap stable id for the clip path, so several shields can share one page. */
function idOf(arms: CoatOfArms): string {
  let hash = 5381;
  for (const char of JSON.stringify(arms)) hash = ((hash * 33) ^ char.charCodeAt(0)) >>> 0;
  return `coa-${hash.toString(36)}`;
}

/** The arms as a standalone SVG, or (with `at`) as a nested one placed inside a larger map. */
export function renderCoatOfArms(arms: CoatOfArms, options: { size?: number; at?: { x: number; y: number; width: number } } = {}): string {
  const id = idOf(arms);
  const shield = SHIELD[arms.shield];
  const box = options.at ? `x="${r1(options.at.x)}" y="${r1(options.at.y)}" width="${r1(options.at.width)}" height="${r1(options.at.width * 1.1)}"` : `width="${options.size ?? 200}" height="${r1((options.size ?? 200) * 1.1)}"`;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220" ${box}>`);
  out.push(`<defs><clipPath id="${id}"><path d="${shield}"/></clipPath><radialGradient id="${id}-l" cx="0.32" cy="0.28" r="0.85"><stop offset="0" stop-color="#fff" stop-opacity="0.38"/><stop offset="0.55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.32"/></radialGradient></defs>`);
  out.push(`<g clip-path="url(#${id})"><rect width="200" height="220" fill="${TINCTURE[arms.field]}"/>`);
  const split = division(arms.division);
  if (split) out.push(`<path d="${split}" fill="${TINCTURE[arms.division2]}"/>`);
  if (arms.ordinary === "bordure") out.push(`<path d="${shield}" fill="none" stroke="${TINCTURE[arms.ordinaryTincture]}" stroke-width="40"/>`);
  else if (arms.ordinary !== "none") out.push(`<path d="${ordinary(arms.ordinary)}" fill="${TINCTURE[arms.ordinaryTincture]}" stroke="#000" stroke-opacity="0.35" stroke-width="1.2"/>`);
  if (arms.charge) {
    const glyph = charge(arms.charge);
    for (const [x, y, size] of places(arms.ordinary, arms.count)) {
      out.push(`<g transform="translate(${r1(x - size / 2)},${r1(y - size / 2)}) scale(${r1(size) / 100})" fill="${TINCTURE[arms.chargeTincture]}" stroke="#000" stroke-opacity="0.6" stroke-width="${r1(150 / size)}" stroke-linejoin="round">${glyph}</g>`);
    }
  }
  out.push(`<rect width="200" height="220" fill="url(#${id}-l)"/></g><path d="${shield}" fill="none" stroke="#1a1a1a" stroke-width="4"/></svg>`);
  return out.join("");
}
