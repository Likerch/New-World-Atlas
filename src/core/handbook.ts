// The world's handbook: a page for any place on any map — what the GM writes about it in Markdown with [[links]] to
// other pages, a secret only the GM sees, tags and a picture. A place has one page at every scale: the page of a city
// is the page of its town on the planet, the page of a star system is the page of its star in the galaxy.
import { pathTo, type WorldDoc } from "./world";

export interface Page {
  /** The page's own title; empty to use the place's name. */
  title: string;
  /** What the players may learn, in Markdown; [[Title]] links another page. */
  text: string;
  /** What only the GM knows. */
  secret: string;
  tags: string[];
  /** A small picture, as a data URL. */
  image?: string;
  /** Where the place is: the map and the thing on it the page was written from. */
  map: string;
  entity: string;
  /** The name it had when last written, for the index and for links. */
  name: string;
  updated: number;
}

/** The key a place's page is kept under: a map's own page ("world") is its place's page on the parent map, up to the
 * first map that is not opened from another. */
export function pageKey(world: WorldDoc, map: string, entity: string): string {
  let key = map;
  let thing = entity;
  for (let guard = 0; thing === "world" && guard < 20; guard++) {
    const node = world.maps[key];
    if (!node?.parent || !node.step || node.step.entity === "underworld") break;
    thing = node.step.entity;
    key = node.parent;
  }
  return `${key}|${thing}`;
}

export function emptyPage(map: string, entity: string, name: string): Page {
  return { title: "", text: "", secret: "", tags: [], map, entity, name, updated: Date.now() };
}

/** A page's title as shown: its own, else the place's name. */
export const titleOf = (page: Page) => page.title.trim() || page.name;

/** The pages a page links to, by the titles in its [[links]]. */
export function linksOf(page: Page): string[] {
  return [...`${page.text}\n${page.secret}`.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/gu)].map((match) => match[1].trim());
}

/** The page a [[link]] means: by title or by the place's name, regardless of case. */
export function findPage(pages: Record<string, Page>, title: string): [string, Page] | null {
  const wanted = title.trim().toLowerCase();
  return Object.entries(pages).find(([, page]) => titleOf(page).toLowerCase() === wanted || page.name.toLowerCase() === wanted) ?? null;
}

const escape = (text: string) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");

/** A little Markdown to HTML: headings, bold, italics, lists, quotes, paragraphs and [[links]] (as buttons the app
 * listens to, marked with the linked title). Everything is escaped first, so a page cannot carry markup of its own. */
export function markdown(text: string): string {
  const inline = (line: string) =>
    escape(line)
      .replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/gu, (_match, target: string, label?: string) => `<button type="button" class="wiki-link" data-page="${target.trim()}">${(label ?? target).trim()}</button>`)
      .replace(/\*\*([^*]+)\*\*/gu, "<b>$1</b>")
      .replace(/(^|[^*])\*([^*]+)\*/gu, "$1<i>$2</i>");
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(`<ul>${list.map((item) => `<li>${item}</li>`).join("")}</ul>`);
    list = [];
  };
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.*)$/u.exec(line);
    const item = /^\s*[-*]\s+(.*)$/u.exec(line);
    if (item) {
      list.push(inline(item[1]));
      continue;
    }
    flush();
    if (heading) out.push(`<h${heading[1].length + 2}>${inline(heading[2])}</h${heading[1].length + 2}>`);
    else if (line.startsWith(">")) out.push(`<blockquote>${inline(line.slice(1).trim())}</blockquote>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  flush();
  return out.join("");
}

/** One thing the world's search found. */
export interface Found {
  kind: "page" | "map" | "name" | "note";
  label: string;
  /** Some words around what matched. */
  context: string;
  map: string;
  entity: string;
  /** The page's key, for pages. */
  page?: string;
}

/** Everything in the world a word turns up: pages (title, text, tags), the maps of the world, the GM's names and
 * notes. A map's own things (towns, stars, rooms) are searched by the level on screen. */
export function searchWorld(world: WorldDoc, query: string, limit = 40): Found[] {
  const word = query.trim().toLowerCase();
  if (!word) return [];
  const around = (text: string) => {
    const at = text.toLowerCase().indexOf(word);
    return at < 0 ? text.slice(0, 80) : `${at > 30 ? "…" : ""}${text.slice(Math.max(0, at - 30), at + 50)}${at + 50 < text.length ? "…" : ""}`;
  };
  const found: Found[] = [];
  for (const [key, page] of Object.entries(world.pages ?? {})) {
    const body = `${titleOf(page)} ${page.text} ${page.tags.join(" ")}`;
    if (body.toLowerCase().includes(word)) found.push({ kind: "page", label: titleOf(page), context: around(page.text || page.tags.join(", ")), map: page.map, entity: page.entity, page: key });
  }
  for (const [key, map] of Object.entries(world.maps)) if (map.title.toLowerCase().includes(word)) found.push({ kind: "map", label: map.title, context: pathTo(world, key).map(([, node]) => node.title).join(" › "), map: key, entity: "world" });
  for (const [key, patch] of Object.entries(world.patches)) {
    for (const [entity, value] of Object.entries(patch.names ?? {})) if (value.toLowerCase().includes(word)) found.push({ kind: "name", label: value, context: world.maps[key]?.title ?? key, map: key, entity });
    for (const [entity, value] of Object.entries(patch.notes ?? {})) if (value.toLowerCase().includes(word)) found.push({ kind: "note", label: patch.names?.[entity] ?? entity, context: around(value), map: key, entity });
  }
  return found.slice(0, limit);
}

/** The handbook as one Markdown file: every page under its title, with its tags; secrets only when asked for. */
export function handbookMarkdown(world: WorldDoc, withSecrets: boolean): string {
  const pages = Object.values(world.pages ?? {}).sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
  const parts = [`# ${world.name}`, ""];
  for (const page of pages) {
    parts.push(`## ${titleOf(page)}`, "");
    if (page.tags.length) parts.push(`*${page.tags.join(", ")}*`, "");
    if (page.text.trim()) parts.push(page.text.trim(), "");
    if (withSecrets && page.secret.trim()) parts.push(`> ${page.secret.trim().replace(/\n/gu, "\n> ")}`, "");
  }
  return parts.join("\n");
}
