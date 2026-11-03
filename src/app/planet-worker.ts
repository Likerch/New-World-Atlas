// Worlds are grown off the page's thread: the page stays alive, shows how far the work has come and can call it off.
/// <reference lib="webworker" />
import { generatePlanet, type PlanetEdits, type PlanetParams } from "../core/index";

export interface PlanetJob {
  id: number;
  params: Partial<PlanetParams>;
  terrain?: PlanetEdits["terrain"];
  image?: PlanetEdits["image"];
}

self.onmessage = (event: MessageEvent<PlanetJob>) => {
  const { id, params, terrain, image } = event.data;
  try {
    let last = 0;
    const planet = generatePlanet(params, terrain, {
      image,
      progress: (share, stage) => {
        // A few reports a second are enough.
        const now = performance.now();
        if (now - last < 80 && share < 1) return;
        last = now;
        postMessage({ id, share, stage });
      },
    });
    // A function cannot cross to the page: the mesh's lookup is rebuilt there.
    const { find: _find, ...mesh } = planet.mesh;
    postMessage({ id, planet: { ...planet, mesh } });
  } catch (problem) {
    postMessage({ id, error: problem instanceof Error ? problem.message : String(problem) });
  }
};
