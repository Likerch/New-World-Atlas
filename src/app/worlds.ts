// The game master's worlds: projects kept in this browser (in IndexedDB, see kv.ts) and saved to or read from files.
// One world is open at a time; it saves itself a moment after every change and says so, and the GM's last changes can
// be undone and redone. A deleted world waits in the trash; a world's snapshots can be gone back to, or branched into
// a world of their own; any world can serve as a template for new ones.
import { useEffect, useRef, useState } from "react";
import { emptyWorld, mergeWorlds, readWorld, summarize, type Campaign, type Setting, type TopLevel, type WorldDoc, type WorldSummary } from "../core/index";
import { kvDelete, kvGet, kvSet, legacy } from "./kv";

const LIST = "atlas.worlds";
const CURRENT = "atlas.world.current";
const TRASH = "atlas.trash";
const MIGRATED = "atlas.migrated";
const OLD_CAMPAIGN = "new-world-atlas/campaign";
const docKey = (id: string) => `atlas.world:${id}`;
const shotsKey = (id: string) => `atlas.snapshots:${id}`;

/** A world's line in the list; a template is offered as the start of new worlds. */
export type WorldLine = WorldSummary & { template?: boolean };
export interface Trashed {
  line: WorldLine;
  at: number;
}
export interface Snapshot {
  at: number;
  label: string;
  world: WorldDoc;
}
export type SaveState = "saved" | "saving" | "failed";

export const newId = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).slice(0, 18);

const readDoc = async (id: string): Promise<WorldDoc | null> => {
  const doc = await kvGet<WorldDoc>(docKey(id));
  try {
    return doc ? readWorld(doc) : null;
  } catch {
    return null;
  }
};

/** Worlds the page kept in its local storage move to IndexedDB, once. */
async function migrate(): Promise<void> {
  if (await kvGet<boolean>(MIGRATED)) return;
  const list = legacy.get<WorldLine[]>(LIST);
  if (list) {
    for (const line of list) {
      const doc = legacy.get<WorldDoc>(docKey(line.id));
      if (doc) await kvSet(docKey(line.id), doc);
    }
    await kvSet(LIST, list);
    const current = legacy.get<string>(CURRENT);
    if (current) await kvSet(CURRENT, current);
  }
  await kvSet(MIGRATED, true);
}

/** The first visit after worlds came in: whatever the GM had already named and pinned becomes their first world. */
function firstWorld(name: string): WorldDoc {
  const world = emptyWorld({ id: newId(), name, top: "planet" });
  const old = legacy.get<Campaign>(OLD_CAMPAIGN);
  return old?.maps ? { ...world, patches: old.maps } : world;
}

async function startUp(name: string): Promise<{ world: WorldDoc; list: WorldLine[]; trash: Trashed[] }> {
  await migrate();
  let list = (await kvGet<WorldLine[]>(LIST)) ?? [];
  const current = await kvGet<string>(CURRENT);
  let world = (current && (await readDoc(current))) || (list[0] && (await readDoc(list[0].id))) || null;
  if (!world) {
    world = firstWorld(name);
    await kvSet(docKey(world.id), world);
    list = [summarize(world), ...list];
    await kvSet(LIST, list);
  }
  await kvSet(CURRENT, world.id);
  return { world, list, trash: (await kvGet<Trashed[]>(TRASH)) ?? [] };
}

export interface NewWorld {
  name: string;
  top: TopLevel;
  setting: Partial<Setting>;
  script: "latin" | "cyrillic";
  /** The top map's first parameters (its seed, and for a planet its size and shape). */
  start: Record<string, unknown>;
}

/** Changes made close together are undone together (a fog stroke, a name typed letter by letter). */
const GROUP_MS = 800;
const UNDO_DEPTH = 40;

export function useWorlds(defaultName: string) {
  const [state, setState] = useState<{ world: WorldDoc; list: WorldLine[]; trash: Trashed[] } | null>(null);
  const [saving, setSaving] = useState<SaveState>("saved");
  const past = useRef<WorldDoc[]>([]);
  const [generation, setGeneration] = useState(0);
  const future = useRef<WorldDoc[]>([]);
  const lastChange = useRef(0);
  const current = useRef<WorldDoc | null>(null);
  current.current = state?.world ?? null;

  useEffect(() => {
    startUp(defaultName)
      .then(setState)
      .catch((problem: unknown) => {
        console.error(problem);
        setState({ world: firstWorld(defaultName), list: [], trash: [] });
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save the open world shortly after each change, and keep its line in the list current.
  const loaded = useRef<WorldDoc | null>(null);
  const world = state?.world ?? null;
  useEffect(() => {
    if (!world) return;
    if (!loaded.current || loaded.current.id !== world.id) {
      loaded.current = world;
      return;
    }
    setSaving("saving");
    const timer = setTimeout(async () => {
      const ok = await kvSet(docKey(world.id), world);
      const line = summarize(world);
      setState((now) => {
        if (!now) return now;
        const list = now.list.some((item) => item.id === world.id) ? now.list.map((item) => (item.id === world.id ? { ...item, ...line } : item)) : [line, ...now.list];
        kvSet(LIST, list);
        return { ...now, list };
      });
      setSaving(ok ? "saved" : "failed");
    }, 300);
    return () => clearTimeout(timer);
  }, [world]);

  const writeList = (list: WorldLine[]) => kvSet(LIST, list);
  const openDoc = async (doc: WorldDoc) => {
    if (current.current) await kvSet(docKey(current.current.id), current.current);
    await kvSet(docKey(doc.id), doc);
    await kvSet(CURRENT, doc.id);
    past.current = [];
    future.current = [];
    setState((now) => {
      if (!now) return now;
      const list = now.list.some((item) => item.id === doc.id) ? now.list.map((item) => (item.id === doc.id ? { ...item, ...summarize(doc) } : item)) : [summarize(doc), ...now.list];
      writeList(list);
      return { ...now, world: doc, list };
    });
  };
  const setWorld = (next: WorldDoc) => {
    current.current = next;
    setState((now) => (now ? { ...now, world: next } : now));
  };

  /** A change to the open world; `quiet` ones (the app noting which map is open) are not undone. */
  const update = (change: (world: WorldDoc) => WorldDoc, quiet = false) => {
    const before = current.current;
    if (!before) return;
    const next = change(before);
    if (next === before) return;
    if (!quiet) {
      const now = Date.now();
      if (now - lastChange.current > GROUP_MS) past.current = [...past.current.slice(-UNDO_DEPTH + 1), before];
      lastChange.current = now;
      future.current = [];
    }
    setWorld(next);
  };

  return {
    ready: state !== null,
    world: state?.world as WorldDoc,
    list: [...(state?.list ?? [])].sort((a, b) => b.updated - a.updated),
    trash: state?.trash ?? [],
    saving,
    update,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    undo: () => {
      const before = past.current.pop();
      if (!before || !current.current) return;
      future.current.push(current.current);
      lastChange.current = 0;
      setWorld({ ...before, maps: current.current.maps, last: current.current.last });
    },
    redo: () => {
      const next = future.current.pop();
      if (!next || !current.current) return;
      past.current.push(current.current);
      lastChange.current = 0;
      setWorld({ ...next, maps: current.current.maps, last: current.current.last });
    },
    open: async (id: string) => {
      if (id === state?.world.id) return;
      const doc = await readDoc(id);
      if (doc) await openDoc(doc);
    },
    create: (input: NewWorld) => openDoc(emptyWorld({ id: newId(), name: input.name, top: input.top, setting: input.setting, script: input.script, start: input.start })),
    rename: async (id: string, name: string) => {
      if (state && id === state.world.id) return update((world) => ({ ...world, name, updated: Date.now() }));
      const doc = await readDoc(id);
      if (!doc) return;
      const next = { ...doc, name, updated: Date.now() };
      await kvSet(docKey(id), next);
      setState((now) => {
        if (!now) return now;
        const list = now.list.map((item) => (item.id === id ? { ...item, ...summarize(next) } : item));
        writeList(list);
        return { ...now, list };
      });
    },
    duplicate: async (id: string, suffix: string) => {
      const doc = state && id === state.world.id ? state.world : await readDoc(id);
      if (!doc) return;
      const copy: WorldDoc = { ...doc, id: newId(), name: `${doc.name} ${suffix}`, created: Date.now(), updated: Date.now() };
      await kvSet(docKey(copy.id), copy);
      setState((now) => {
        if (!now) return now;
        const list = [summarize(copy), ...now.list];
        writeList(list);
        return { ...now, list };
      });
    },
    /** A world to the trash: out of the list, but kept until the trash is emptied. */
    remove: async (id: string) => {
      if (!state) return;
      const line = state.list.find((item) => item.id === id);
      if (!line) return;
      const trash = [{ line, at: Date.now() }, ...state.trash];
      await kvSet(TRASH, trash);
      const list = state.list.filter((item) => item.id !== id);
      await writeList(list);
      if (id !== state.world.id) return setState({ ...state, list, trash });
      // The open world was put away: open another, or start afresh.
      const other = list[0] ? await readDoc(list[0].id) : null;
      const next = other ?? emptyWorld({ id: newId(), name: defaultName, top: "planet" });
      await kvSet(docKey(next.id), next);
      await kvSet(CURRENT, next.id);
      const withNext = other ? list : [summarize(next), ...list];
      await writeList(withNext);
      past.current = [];
      future.current = [];
      setState({ world: next, list: withNext, trash });
    },
    restore: async (id: string) => {
      if (!state) return;
      const item = state.trash.find((entry) => entry.line.id === id);
      if (!item) return;
      const trash = state.trash.filter((entry) => entry.line.id !== id);
      const list = [item.line, ...state.list];
      await kvSet(TRASH, trash);
      await writeList(list);
      setState({ ...state, list, trash });
    },
    /** Gone for good: the worlds and their snapshots. */
    purge: async (ids: string[]) => {
      if (!state) return;
      for (const id of ids) {
        await kvDelete(docKey(id));
        await kvDelete(shotsKey(id));
      }
      const trash = state.trash.filter((entry) => !ids.includes(entry.line.id));
      await kvSet(TRASH, trash);
      setState({ ...state, trash });
    },
    setTemplate: async (id: string, template: boolean) => {
      if (!state) return;
      const list = state.list.map((item) => (item.id === id ? { ...item, template } : item));
      await writeList(list);
      setState({ ...state, list });
    },
    /** A new world on a template's footing: its top, age, script and top map's settings, none of its notes. */
    fromTemplate: async (id: string, name: string) => {
      const doc = state && id === state.world.id ? state.world : await readDoc(id);
      if (!doc) return;
      const root = Object.entries(doc.maps).find(([, map]) => map.parent === null);
      await openDoc(emptyWorld({ id: newId(), name, top: doc.top, setting: doc.setting, script: doc.script, start: root ? root[1].params : doc.start ?? {} }));
    },
    snapshots: async (id: string) => (await kvGet<Snapshot[]>(shotsKey(id))) ?? [],
    /** The open world as it is now, kept to go back to or branch from. */
    snapshot: async (label: string) => {
      if (!state) return;
      const list = (await kvGet<Snapshot[]>(shotsKey(state.world.id))) ?? [];
      await kvSet(shotsKey(state.world.id), [{ at: Date.now(), label, world: state.world }, ...list].slice(0, 30));
    },
    /** Back to a snapshot (the present can be undone back to). */
    goBack: (shot: Snapshot) => {
      if (!current.current) return;
      past.current = [...past.current.slice(-UNDO_DEPTH + 1), current.current];
      future.current = [];
      setWorld({ ...shot.world, id: current.current.id, updated: Date.now() });
      setGeneration((count) => count + 1);
    },
    /** Bumped when the open world is replaced in place (back to a snapshot): its view starts afresh. */
    generation,
    /** A snapshot as a world of its own: a branch to try another way. */
    branch: (shot: Snapshot, name: string) => openDoc({ ...shot.world, id: newId(), name, created: Date.now(), updated: Date.now() }),
    /** A world as a file, to keep or to give to another game master. */
    file: async (id: string): Promise<WorldDoc | null> => (state && id === state.world.id ? state.world : readDoc(id)),
    /** Opens a world from a file. One already here under the same id is either merged with it or kept apart, the
     * file coming in as a copy. */
    load: async (data: unknown, merge = false) => {
      const doc = readWorld(data);
      const exists = state?.list.some((item) => item.id === doc.id) || state?.trash.some((entry) => entry.line.id === doc.id);
      if (exists && merge) {
        const mine = state && doc.id === state.world.id ? state.world : await readDoc(doc.id);
        if (mine) return openDoc(mergeWorlds(mine, doc));
      }
      await openDoc(exists ? { ...doc, id: newId(), updated: Date.now() } : doc);
    },
    /** Whether a world of that id is already here. */
    has: (data: unknown) => {
      try {
        const id = readWorld(data).id;
        return !!state?.list.some((item) => item.id === id) || !!state?.trash.some((entry) => entry.line.id === id);
      } catch {
        return false;
      }
    },
  };
}

export type Worlds = ReturnType<typeof useWorlds>;
