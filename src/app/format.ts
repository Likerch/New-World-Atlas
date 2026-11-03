// Number formatting for the inspector, in the reader's own way of writing numbers (3,1 млн; 3.1 million).
import type { T } from "./i18n";

const formats = new Map<string, Intl.NumberFormat>();
function number(value: number, t: T, digits = 0): string {
  const key = `${t.locale}/${digits}`;
  let format = formats.get(key);
  if (!format) formats.set(key, (format = new Intl.NumberFormat(t.locale === "ru" ? "ru-RU" : "en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits })));
  return format.format(value);
}

/** People counted in thousands. */
export function people(thousands: number, t: T): string {
  if (thousands >= 1000) return `${number(thousands / 1000, t, thousands >= 10_000 ? 0 : 1)} ${t("unit.million")}`;
  if (thousands >= 1) return `${number(thousands, t, thousands >= 100 ? 0 : 1)} ${t("unit.thousand")}`;
  return number(Math.round(thousands * 1000), t);
}

export function area(km2: number, t: T): string {
  return `${number(Math.round(km2), t)} ${t("unit.km2")}`;
}

export function km(value: number, t: T): string {
  return `${number(Math.round(value), t)} ${t("unit.km")}`;
}
