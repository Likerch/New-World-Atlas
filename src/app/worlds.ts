// The game master's worlds: projects kept in this browser (a list, and each world under its own key) and saved to or
// read from files. One world is open at a time; it saves itself a moment after every change.
import { useEffect, useRef, useState } from "react";
import { emptyWorld, readWorld, summarize, type Campaign, type Setting, type TopLevel, type WorldDoc, type WorldSummary } from "../core/index";

const LIST = "atlas.worlds";
const CURRENT = "atlas.world.current";
const OLD_CAMPAIGN = "new-world-atlas/campaign";
const docKey = (id: string) => `atlas.world:${id}`;

const read = <T>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Storage may be full or blocked; the world still lives in this session and can be saved as a file.
    return false;
  }
};
const forget = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to do when storage is blocked.
  }
};

export const newId = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).slice(0, 18);

/** The first visit after worlds came in: whatever the GM had already named and pinned becomes their first world. */
function firstWorld(name: string): WorldDoc {
  const world = emptyWorld({ id: newId(), name, top: "planet" });
  const old = read<Campaign>(OLD_CAMPAIGN);
  return old?.maps ? { ...world, patches: old.maps } : world;
}

function startUp(name: string): { world: WorldDoc; list: WorldSummary[] } {
  let list = read<WorldSummary[]>(LIST) ?? [];
  const current = read<string>(CURRENT);
  let world = (current && read<WorldDoc>(docKey(current))) || (list[0] && read<WorldDoc>(docKey(list[0].id))) || null;
  if (!world) {
    world = firstWorld(name);
    write(docKey(world.id), world);
    list = [summarize(world), ...list];
    write(LIST, list);
  }
  write(CURRENT, world.id);
  return { world, list };
}

export interface NewWorld {
  name: string;
  top: TopLevel;
  setting: Partial<Setting>;
  script: "latin" | "cyrillic";
  /** The top map's first parameters (its seed, and for a planet its size and shape). */
  start: Record<string, unknown>;
}

export function useWorlds(defaultName: string) {
  const [state, setState] = useState(() => startUp(defaultName));
  const { world, list } = state;
  const [saveFailed, setSaveFailed] = useState(false);
  // Save the open world shortly after each change, and keep its line in the list current.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const ok = write(docKey(world.id), world);
      setSaveFailed(!ok);
      const line = summarize(world);
      setState((current) => {
        const next = current.list.some((item) => item.id === world.id) ? current.list.map((item) => (item.id === world.id ? line : item)) : [line, ...current.list];
        write(LIST, next);
        return { ...current, list: next };
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [world]);

  const openDoc = (doc: WorldDoc) => {
    write(docKey(doc.id), doc);
    write(CURRENT, doc.id);
    setState((current) => {
      const next = current.list.some((item) => item.id === doc.id) ? current.list.map((item) => (item.id === doc.id ? summarize(doc) : item)) : [summarize(doc), ...current.list];
      write(LIST, next);
      return { world: doc, list: next };
    });
  };

  return {
    world,
    list: [...list].sort((a, b) => b.updated - a.updated),
    saveFailed,
    update: (change: (world: WorldDoc) => WorldDoc) => setState((current) => ({ ...current, world: change(current.world) })),
    open: (id: string) => {
      if (id === world.id) return;
      write(docKey(world.id), world);
      const doc = read<WorldDoc>(docKey(id));
      if (doc) openDoc(doc);
    },
    create: (input: NewWorld) => {
      write(docKey(world.id), world);
      openDoc(emptyWorld({ id: newId(), name: input.name, top: input.top, setting: input.setting, script: input.script, start: input.start }));
    },
    rename: (id: string, name: string) => {
      if (id === world.id) setState((current) => ({ ...current, world: { ...current.world, name, updated: Date.now() } }));
      else {
        const doc = read<WorldDoc>(docKey(id));
        if (!doc) return;
        const next = { ...doc, name, updated: Date.now() };
        write(docKey(id), next);
        setState((current) => {
          const lines = current.list.map((item) => (item.id === id ? summarize(next) : item));
          write(LIST, lines);
          return { ...current, list: lines };
        });
      }
    },
    duplicate: (id: string, suffix: string) => {
      const doc = id === world.id ? world : read<WorldDoc>(docKey(id));
      if (!doc) return;
      const copy: WorldDoc = { ...doc, id: newId(), name: `${doc.name} ${suffix}`, created: Date.now(), updated: Date.now() };
      write(docKey(copy.id), copy);
      setState((current) => {
        const lines = [summarize(copy), ...current.list];
        write(LIST, lines);
        return { ...current, list: lines };
      });
    },
    remove: (id: string) => {
      forget(docKey(id));
      setState((current) => {
        const lines = current.list.filter((item) => item.id !== id);
        write(LIST, lines);
        if (id !== current.world.id) return { ...current, list: lines };
        // The open world was removed: open another, or start afresh.
        const other = lines[0] ? read<WorldDoc>(docKey(lines[0].id)) : null;
        const next = other ?? emptyWorld({ id: newId(), name: defaultName, top: "planet" });
        write(docKey(next.id), next);
        write(CURRENT, next.id);
        const withNext = other ? lines : [summarize(next), ...lines];
        write(LIST, withNext);
        return { world: next, list: withNext };
      });
    },
    /** A world as a file, to keep or to give to another game master. */
    file: (id: string): WorldDoc | null => (id === world.id ? world : read<WorldDoc>(docKey(id))),
    /** Opens a world from a file; one already here under the same id is kept, the file comes in as a copy. */
    load: (data: unknown) => {
      const doc = readWorld(data);
      const exists = list.some((item) => item.id === doc.id);
      openDoc(exists ? { ...doc, id: newId(), updated: Date.now() } : doc);
    },
  };
}

export type Worlds = ReturnType<typeof useWorlds>;
