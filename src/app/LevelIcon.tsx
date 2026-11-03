// The levels' icons, drawn in the text's own colour, so they look the same on every system (emoji do not).
const PATHS: Record<string, string> = {
  universe: "M3 4.5a1.2 1.2 0 1 0 0 .01M12.5 3a1 1 0 1 0 0 .01M8 8m-2.2 0a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0M4 12.5a.9.9 0 1 0 0 .01M13 12a1.4 1.4 0 1 0 0 .01",
  galaxy: "M8 8c0-1.5 1.8-2.2 3-1.2 1.6 1.3.6 4.2-2 4.5-3 .4-5-2.2-4.2-4.8C5.6 3.6 9.4 2.4 12 4M8 8c0 1.5-1.8 2.2-3 1.2-1.6-1.3-.6-4.2 2-4.5 3-.4 5 2.2 4.2 4.8-.8 2.9-4.6 4.1-7.2 2.5",
  system: "M8 8m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0M8 8m-5.5 0a5.5 2.6 0 1 0 11 0a5.5 2.6 0 1 0-11 0M13.2 7.2a.9.9 0 1 0 0 .01",
  planet: "M8 8m-5.5 0a5.5 5.5 0 1 0 11 0a5.5 5.5 0 1 0-11 0M2.5 8h11M8 2.5c-2.2 2.8-2.2 8.2 0 11M8 2.5c2.2 2.8 2.2 8.2 0 11",
  region: "M2 4l4-1.5 4 1.5 4-1.5v9.5L10 13.5 6 12 2 13.5zM6 2.5V12M10 4v9.5",
  underworld: "M2 13.5h12M3.5 13.5V9a4.5 4.5 0 0 1 9 0v4.5M6 13.5v-3a2 2 0 0 1 4 0v3",
  city: "M2 14V6l2-1.5L6 6v8M6 9h4v5M10 14V4l2-1.5L14 4v10M2 14h12M8 9V7",
  building: "M2.5 7.5 8 3l5.5 4.5M4 6.5V14h8V6.5M7 14v-3.5h2V14",
  local: "M2.5 2.5h11v11h-11zM2.5 6.5h11M2.5 10h11M6.5 2.5v11M10 2.5v11",
};

export function LevelIcon({ level }: { level: string }) {
  const d = PATHS[level];
  if (!d) return null;
  return (
    <svg className="level-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
