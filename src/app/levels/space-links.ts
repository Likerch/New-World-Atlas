// The ways down and across from the space maps, which the app wires to the other levels: a star's system, a place as
// a local map or a building, a colony as a city, a world as a planet, a galaxy, a lone star.
import type { BuildingParams, CityParams, Galaxy, GalaxyParams, GalaxySurvey, Language, LocalLink, PlanetParams, SystemParams } from "../../core/index";

export interface SpaceLinks {
  openSystem: (galaxy: Galaxy, star: number, survey: GalaxySurvey | null) => void;
  openLoneSystem: (params: Partial<SystemParams>, entity: string) => void;
  openLocal: (link: LocalLink, entity: string) => void;
  openBuilding: (params: Partial<BuildingParams>, entity: string) => void;
  openCity: (params: Partial<CityParams>, language: Language | null, entity: string) => void;
  openPlanet: (params: Partial<PlanetParams>, entity: string) => void;
  openGalaxy: (params: Partial<GalaxyParams>, entity: string) => void;
}
