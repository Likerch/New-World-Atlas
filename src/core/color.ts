// Colours for map entities: well-spread hues, adjustable lightness.

export function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** The n-th of a run of distinct hues (golden-angle steps), offset by a seed value in [0, 1). */
export function paletteColor(index: number, offset: number, saturation = 0.5, lightness = 0.62): string {
  return hslToHex((offset * 360 + index * 137.508) % 360, saturation, lightness);
}

/** A variation of a hex colour, lighter (amount > 0) or darker. */
export function shade(hex: string, amount: number): string {
  const value = parseInt(hex.slice(1), 16);
  const mix = (channel: number) => Math.round(amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount));
  const r = mix((value >> 16) & 255);
  const g = mix((value >> 8) & 255);
  const b = mix(value & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
