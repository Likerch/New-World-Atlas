// A planet's (or a region's) things in words for the GM: found by name for the search, and described in Markdown to
// copy into notes, a handbook page or a chat.
import { featureWord, BIOMES, settingOf, ageOf, type Planet } from "../core/index";
import { area, km, people } from "./format";
import type { T } from "./i18n";
import { legendOf, type Selection } from "./Inspector";
import type { Hit } from "./levels/types";

/** Things of the map whose name has the word: realms, provinces, towns, rivers, places, waters and lands, peoples, faiths. */
export function searchPlanet(planet: Planet, query: string, t: T, nm: (name: string) => string, pick: (selection: Selection, at: [number, number]) => void): Hit[] {
  const word = query.trim().toLowerCase();
  if (!word) return [];
  const has = (name: string) => !!name && (name.toLowerCase().includes(word) || nm(name).toLowerCase().includes(word));
  const hits: Hit[] = [];
  const centre = (cells: number[]): [number, number] => (cells.length ? [planet.mesh.x[cells[Math.floor(cells.length / 2)]], planet.mesh.y[cells[Math.floor(cells.length / 2)]]] : [0, 0]);
  for (const state of planet.states.slice(1)) if (state.cells && has(state.name)) hits.push({ label: t(`form.${state.formKey}`, { name: nm(state.name) }), detail: t("panel.states"), select: () => pick({ kind: "state", id: state.id }, state.pole) });
  for (const province of planet.provinces.slice(1)) if (has(province.name)) hits.push({ label: t(`province.${province.formKey}`, { name: nm(province.name) }), detail: nm(planet.states[province.state]?.name ?? ""), select: () => pick({ kind: "province", id: province.id }, province.pole) });
  for (const burg of planet.burgs.slice(1)) if (!burg.removed && has(burg.name)) hits.push({ label: nm(burg.name), detail: `${people(burg.population, t)} · ${nm(planet.states[burg.state]?.name ?? "")}`, select: () => pick({ kind: "burg", id: burg.id }, [burg.x, burg.y]) });
  for (const river of planet.rivers.slice(1)) if (has(river.name)) hits.push({ label: nm(river.name), detail: t("place.river"), select: () => pick({ kind: "river", id: river.id }, centre(river.cells)) });
  for (const marker of planet.markers.slice(1)) if (has(marker.name) || t(`marker.${marker.kind}`).toLowerCase().includes(word)) hits.push({ label: `${t(`marker.${marker.kind}`)} ${nm(marker.name)}`.trim(), detail: nm(planet.states[planet.state[marker.cell]]?.name ?? ""), select: () => pick({ kind: "marker", id: marker.id }, [marker.x, marker.y]) });
  for (const feature of planet.features.slice(1)) if (has(feature.name)) {
    const cell = Array.from({ length: planet.mesh.cells }, (_, c) => c).find((c) => planet.feature[c] === feature.id) ?? 0;
    hits.push({ label: `${t(`feature.${featureWord(feature)}`)} ${nm(feature.name)}`, detail: "", select: () => pick({ kind: "feature", id: feature.id }, [planet.mesh.x[cell], planet.mesh.y[cell]]) });
  }
  for (const culture of planet.cultures.slice(1)) if (has(culture.name)) hits.push({ label: nm(culture.name), detail: t("place.culture"), select: () => pick({ kind: "culture", id: culture.id }, [planet.mesh.x[culture.center], planet.mesh.y[culture.center]]) });
  for (const faith of planet.religions.slice(1)) if (has(faith.name)) hits.push({ label: nm(faith.name), detail: t("place.religion"), select: () => pick({ kind: "religion", id: faith.id }, [planet.mesh.x[faith.center] ?? 0, planet.mesh.y[faith.center] ?? 0]) });
  return hits;
}

/** The selected thing in Markdown: its name and the facts the inspector shows. */
export function describePlanet(planet: Planet, selection: Selection | null, t: T, nm: (name: string) => string): string {
  const age = ageOf(settingOf(planet.params.setting));
  const realm = (id: number) => (id ? t(`form.${planet.states[id].formKey}`, { name: nm(planet.states[id].name) }) : t("form.wild"));
  const lines = (title: string, facts: [string, string | number][], extra = "") => [`## ${title}`, "", ...facts.filter(([, value]) => value !== "" && value !== undefined).map(([label, value]) => `- **${label}:** ${value}`), extra ? `\n${extra}` : ""].join("\n").trim();
  if (!selection) return lines(nm(planet.name), [[t("setting.era"), t(`era.${age}`)], [t("panel.states"), planet.states.length - 1], [t("panel.burgs"), planet.burgs.filter((burg) => burg.id && !burg.removed).length], ...(planet.history ? [[t("history.year"), planet.history.years] as [string, number]] : [])]);
  const { kind, id } = selection;
  if (kind === "burg") {
    const burg = planet.burgs[id];
    const town = planet.history?.towns[id];
    return lines(nm(burg.name), [
      [t("stat.population"), people(burg.population, t)],
      [t("place.state"), realm(burg.state)],
      [t("place.culture"), nm(planet.cultures[burg.culture]?.name ?? "")],
      [t("place.religion"), nm(planet.religions[planet.religion[burg.cell]]?.name ?? "")],
      ...(town ? [[t("history.story"), t("history.founded", { year: town.founded, by: nm(planet.history!.polities[town.owners[0]?.[1] ?? town.polity]?.name ?? "") })] as [string, string]] : []),
    ], (["capital", "port", "walls", "citadel", "temple", "market"] as const).filter((trait) => burg[trait]).map((trait) => t(`burg.${trait}`)).join(" · "));
  }
  if (kind === "state") {
    const state = planet.states[id];
    return lines(realm(id), [
      [t("stat.capital"), nm(planet.burgs[state.capital]?.name ?? "")],
      [t("stat.area"), area(state.area, t)],
      [t("stat.population"), people(state.rural + state.urban, t)],
      [t("place.culture"), nm(planet.cultures[state.culture]?.name ?? "")],
    ], state.neighbors.map((other) => `- ${realm(other)} — ${t(`relation.${state.relations[other] ?? "neutral"}`)}`).join("\n"));
  }
  if (kind === "province") {
    const province = planet.provinces[id];
    return lines(t(`province.${province.formKey}`, { name: nm(province.name) }), [[t("place.state"), realm(province.state)], [t("province.centre"), nm(planet.burgs[province.burg]?.name ?? "")]]);
  }
  if (kind === "marker") {
    const marker = planet.markers[id];
    return lines(`${t(`marker.${marker.kind}@${age}`)} ${nm(marker.name)}`.trim(), [[t("place.state"), realm(planet.state[marker.cell])]], legendOf(marker, t, nm, age));
  }
  if (kind === "river") {
    const river = planet.rivers[id];
    return lines(nm(river.name), [[t("stat.length"), km(river.length, t)], [t("stat.flowsInto"), river.parent ? nm(planet.rivers[river.parent].name) : t("stat.sea")]]);
  }
  if (kind === "culture") return lines(nm(planet.cultures[id].name), [[t("stat.kind"), t(`culture.${planet.cultures[id].kind}`)], [t("stat.population"), people(planet.cultures[id].population, t)]]);
  if (kind === "religion") return lines(nm(planet.religions[id].name), [[t("stat.kind"), t(`religion.kind.${planet.religions[id].kind}`)], [t("religion.deity"), nm(planet.religions[id].deity)]]);
  if (kind === "feature") return lines(`${t(`feature.${featureWord(planet.features[id])}`)} ${nm(planet.features[id].name)}`.trim(), []);
  const cell = id;
  return lines(planet.water[cell] ? t(`feature.${featureWord(planet.features[planet.feature[cell]])}`) : t(`biome.${BIOMES[planet.biome[cell]].key}`), [
    [t("place.state"), planet.water[cell] ? "" : realm(planet.state[cell])],
    [t("place.temperature"), `${planet.temperature[cell].toFixed(1)} °C`],
  ]);
}
