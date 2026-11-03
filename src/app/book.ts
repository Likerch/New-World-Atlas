// The atlas as a book to print: a cover, the contents, every map open in the world as a full page, the handbook's
// pages and an index of named places. It opens in a window of its own to print (or is saved as a page, where windows
// are blocked).
import { markdown, titleOf, type WorldDoc } from "../core/index";
import { download } from "./Handbook";
import type { T } from "./i18n";

const escape = (text: string) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");

export function printAtlas(t: T, nm: (name: string) => string, world: WorldDoc, maps: { title: string; svg: string }[], withSecrets: boolean) {
  const pages = Object.values(world.pages ?? {}).sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
  const names = [...new Set(Object.values(world.patches).flatMap((patch) => Object.values(patch.names ?? {})).concat(pages.map(titleOf)))].sort((a, b) => a.localeCompare(b));
  const html = `<!doctype html>
<html lang="${t.locale}"><head><meta charset="utf-8"><title>${escape(nm(world.name))}</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; color: #222; margin: 0; }
  section { page-break-after: always; padding: 24mm 18mm; }
  .cover { display: grid; place-items: center; min-height: 240mm; text-align: center; }
  .cover h1 { font-size: 42pt; letter-spacing: 4px; margin: 0; }
  h2 { border-bottom: 1px solid #999; padding-bottom: 4px; }
  .map svg { width: 100%; height: auto; max-height: 230mm; }
  .page img { max-width: 60%; float: right; margin: 0 0 8px 12px; }
  .secret { border-left: 3px solid #b5562e; padding-left: 8px; color: #6a3a22; }
  .wiki-link { border: none; background: none; padding: 0; font: inherit; color: inherit; text-decoration: underline dotted; }
  .index { columns: 3; font-size: 10pt; }
  @media print { section { padding: 12mm; } }
</style></head><body>
<section class="cover"><div><h1>${escape(nm(world.name))}</h1><p>${escape(t("book.atlasOf"))}</p><p>${new Date().toLocaleDateString(t.locale)}</p></div></section>
<section><h2>${escape(t("book.contents"))}</h2><ol>${maps.map((map) => `<li>${escape(map.title)}</li>`).join("")}${pages.length ? `<li>${escape(t("book.title.book"))}</li>` : ""}${names.length ? `<li>${escape(t("book.index"))}</li>` : ""}</ol></section>
${maps.map((map) => `<section class="map"><h2>${escape(map.title)}</h2>${map.svg}</section>`).join("\n")}
${pages.length ? `<section><h2>${escape(t("book.title.book"))}</h2>${pages.map((page) => `<div class="page"><h3>${escape(nm(titleOf(page)))}</h3>${page.image ? `<img src="${page.image}" alt="">` : ""}${markdown(page.text)}${withSecrets && page.secret ? `<div class="secret">${markdown(page.secret)}</div>` : ""}</div>`).join("")}</section>` : ""}
${names.length ? `<section><h2>${escape(t("book.index"))}</h2><div class="index">${names.map((name) => `<div>${escape(nm(name))}</div>`).join("")}</div></section>` : ""}
</body></html>`;
  const view = window.open("", "_blank");
  if (!view) {
    download(`${world.name || "atlas"}.html`, html, "text/html");
    return;
  }
  view.document.write(html);
  view.document.close();
  setTimeout(() => view.print(), 700);
}
