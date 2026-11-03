// The world's handbook in the app: a page for a place (read it, or write it), and the book of all pages with its
// index, a Markdown file of it and a printed atlas.
import { useMemo, useState } from "react";
import { emptyPage, findPage, handbookMarkdown, markdown, titleOf, type Page, type WorldDoc } from "../core/index";
import type { T } from "./i18n";
import { useEscape } from "./keys";

/** A picture made small enough to keep in the world: at most 640 px across, as JPEG. */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const k = Math.min(1, 640 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * k);
    canvas.height = Math.round(image.height * k);
    canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function download(name: string, text: string, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** One page: read it (links lead to other pages), or write it. */
function PageView({ t, page, players, onChange, onFollow, onShow }: { t: T; page: Page; players: boolean; onChange: (page: Page) => void; onFollow: (title: string) => void; onShow?: () => void }) {
  const [writing, setWriting] = useState(!page.text && !page.secret && !players);
  const follow = (event: React.MouseEvent) => {
    const target = (event.target as HTMLElement).closest(".wiki-link") as HTMLElement | null;
    if (target?.dataset.page) onFollow(target.dataset.page);
  };
  const set = (change: Partial<Page>) => onChange({ ...page, ...change, updated: Date.now() });
  return (
    <div className="page">
      <div className="row-buttons">
        <h3 className="grow">{titleOf(page)}</h3>
        {onShow ? (
          <button type="button" onClick={onShow}>
            🗺 {t("book.show")}
          </button>
        ) : null}
        {!players ? (
          <button type="button" aria-pressed={writing} onClick={() => setWriting(!writing)}>
            {writing ? `👁 ${t("book.read")}` : `✎ ${t("book.write")}`}
          </button>
        ) : null}
        <button type="button" onClick={() => navigator.clipboard?.writeText(`## ${titleOf(page)}\n\n${page.text}${!players && page.secret ? `\n\n> ${page.secret}` : ""}`)} title={t("book.copy")}>
          📋
        </button>
      </div>
      {page.image ? <img className="page-image" src={page.image} alt={titleOf(page)} /> : null}
      {writing ? (
        <>
          <label>
            {t("book.title")}
            <input value={page.title} placeholder={page.name} onChange={(event) => set({ title: event.target.value })} />
          </label>
          <label>
            {t("book.text")}
            <textarea rows={9} value={page.text} placeholder={t("book.textHint")} onChange={(event) => set({ text: event.target.value })} />
          </label>
          <label>
            🔒 {t("book.secret")}
            <textarea rows={4} value={page.secret} onChange={(event) => set({ secret: event.target.value })} />
          </label>
          <label>
            {t("book.tags")}
            <input value={page.tags.join(", ")} placeholder={t("book.tagsHint")} onChange={(event) => set({ tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} />
          </label>
          <label>
            {t("book.image")}
            <input type="file" accept="image/*" onChange={async (event) => event.target.files?.[0] && set({ image: await shrink(event.target.files[0]) })} />
          </label>
          {page.image ? (
            <button type="button" onClick={() => set({ image: undefined })}>
              ✕ {t("book.noImage")}
            </button>
          ) : null}
        </>
      ) : (
        <>
          {page.tags.length ? <p className="muted">🏷 {page.tags.join(", ")}</p> : null}
          <div className="page-text" onClick={follow} dangerouslySetInnerHTML={{ __html: markdown(page.text) || `<p class="muted">${t("book.empty")}</p>` }} />
          {!players && page.secret ? <div className="page-text secret-box" onClick={follow} dangerouslySetInnerHTML={{ __html: markdown(page.secret) }} /> : null}
        </>
      )}
    </div>
  );
}

/** The handbook: every page with search and tags, one page open; the whole of it as Markdown or a printed atlas. */
export function Handbook({
  t,
  world,
  players,
  focus,
  onSave,
  onShow,
  onBook,
  onClose,
}: {
  t: T;
  world: WorldDoc;
  players: boolean;
  /** The page to open first, and the place to make it for when there is none yet. */
  focus: { key: string; map: string; entity: string; name: string } | null;
  onSave: (key: string, page: Page) => void;
  onShow: (page: Page) => void;
  onBook: () => void;
  onClose: () => void;
}) {
  useEscape(onClose);
  const pages = world.pages ?? {};
  const [open, setOpen] = useState<string | null>(focus?.key ?? null);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const tags = useMemo(() => [...new Set(Object.values(pages).flatMap((page) => page.tags))].sort(), [pages]);
  const word = query.trim().toLowerCase();
  const list = Object.entries(pages)
    .filter(([, page]) => (!tag || page.tags.includes(tag)) && (!word || `${titleOf(page)} ${page.text} ${players ? "" : page.secret}`.toLowerCase().includes(word)))
    .sort(([, a], [, b]) => titleOf(a).localeCompare(titleOf(b)));
  const page = open ? pages[open] ?? (focus && focus.key === open ? emptyPage(focus.map, focus.entity, focus.name) : null) : null;
  return (
    <div className="modal-back">
      <div className="modal handbook" role="dialog" aria-modal="true" aria-label={t("book.title.book")}>
        <div className="modal-head">
          <h2>📖 {t("book.title.book")}</h2>
          <button type="button" className="ghost" onClick={onClose} aria-label={t("action.close")}>
            ✕
          </button>
        </div>
        <div className="handbook-grid">
          <aside>
            <input className="search" value={query} placeholder={t("search")} onChange={(event) => setQuery(event.target.value)} />
            {tags.length ? (
              <select value={tag} onChange={(event) => setTag(event.target.value)} aria-label={t("book.tags")}>
                <option value="">{t("book.allTags")}</option>
                {tags.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            ) : null}
            <ul className="list">
              {list.map(([key, item]) => (
                <li key={key} aria-selected={key === open} onClick={() => setOpen(key)}>
                  <span className="grow">{titleOf(item)}</span>
                  {item.secret && !players ? <small>🔒</small> : null}
                </li>
              ))}
            </ul>
            {!list.length ? <p className="muted">{t("book.none")}</p> : null}
            <div className="row-buttons">
              <button type="button" onClick={() => download(`${world.name || "world"}.md`, handbookMarkdown(world, false))}>
                ⬇ {t("book.markdown")}
              </button>
              {!players ? (
                <button type="button" onClick={() => download(`${world.name || "world"}-gm.md`, handbookMarkdown(world, true))}>
                  ⬇ {t("book.markdownGm")}
                </button>
              ) : null}
              <button type="button" onClick={onBook}>
                🖨 {t("book.atlas")}
              </button>
            </div>
          </aside>
          <section>
            {page && open ? (
              <PageView
                key={open}
                t={t}
                page={page}
                players={players}
                onChange={(next) => onSave(open, next)}
                onFollow={(title) => {
                  const found = findPage(pages, title);
                  if (found) setOpen(found[0]);
                }}
                onShow={() => onShow(page)}
              />
            ) : (
              <p className="muted">{t("book.pick")}</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
