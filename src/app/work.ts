// Heavy generation in a worker: a promise for the result, progress as it goes, and a way to call it off. Where workers
// are missing the work runs on the page as before.
import { generatePlanet, withFind, type Mesh, type Planet, type PlanetEdits, type PlanetParams, type Progress } from "../core/index";

export interface Job<T> {
  promise: Promise<T>;
  cancel: () => void;
}

let worker: Worker | null = null;
let counter = 0;
const waiting = new Map<number, { resolve: (planet: Planet) => void; reject: (problem: Error) => void; progress: Progress }>();

function hire(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./planet-worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<{ id: number; share?: number; stage?: string; planet?: Planet; error?: string }>) => {
    const { id, share, stage, planet, error } = event.data;
    const job = waiting.get(id);
    if (!job) return;
    if (planet) {
      waiting.delete(id);
      job.resolve({ ...planet, mesh: withFind(planet.mesh as Omit<Mesh, "find">) });
    } else if (error !== undefined) {
      waiting.delete(id);
      job.reject(new Error(error));
    } else if (share !== undefined) job.progress(share, stage ?? "");
  };
  return worker;
}

/** A world grown in the worker. Calling it off ends the worker (a new one is hired for the next job). */
export function growPlanet(params: Partial<PlanetParams>, terrain: PlanetEdits["terrain"] | undefined, progress: Progress, image?: PlanetEdits["image"]): Job<Planet> {
  if (typeof Worker === "undefined") {
    return { promise: new Promise((resolve) => resolve(generatePlanet(params, terrain, { progress, image }))), cancel: () => undefined };
  }
  const id = ++counter;
  const promise = new Promise<Planet>((resolve, reject) => {
    waiting.set(id, { resolve, reject, progress });
    hire().postMessage({ id, params, terrain, image });
  });
  return {
    promise,
    cancel: () => {
      const own = waiting.get(id);
      waiting.delete(id);
      own?.reject(new Error("cancelled"));
      worker?.terminate();
      worker = null;
      for (const [other, job] of waiting) {
        waiting.delete(other);
        job.reject(new Error("cancelled"));
      }
    },
  };
}
