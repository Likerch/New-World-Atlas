// Number formatting for the inspector.
import type { T } from "./i18n";

/** People counted in thousands. */
export function people(thousands: number, t: T): string {
  if (thousands >= 1000) return `${(thousands / 1000).toFixed(thousands >= 10_000 ? 0 : 1)} ${t("unit.million")}`;
  if (thousands >= 1) return `${thousands.toFixed(thousands >= 100 ? 0 : 1)} ${t("unit.thousand")}`;
  return `${Math.round(thousands * 1000)}`;
}

export function area(km2: number, t: T): string {
  return `${Math.round(km2).toLocaleString()} ${t("unit.km2")}`;
}

export function km(value: number, t: T): string {
  return `${Math.round(value).toLocaleString()} ${t("unit.km")}`;
}
