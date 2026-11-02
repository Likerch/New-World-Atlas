// The map viewport: wheel to zoom around the cursor, drag to pan, click to pick a place. The SVG is drawn once per
// render and moved with a CSS transform, so panning stays smooth on large maps.
import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface View {
  x: number;
  y: number;
  k: number;
}

export interface Focus {
  x: number;
  y: number;
  nonce: number;
}

export function MapView({ svg, width, height, focus, onPick }: { svg: string; width: number; height: number; focus: Focus | null; onPick: (x: number, y: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [fit, setFit] = useState(1);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const fitView = () => {
    const el = box.current;
    if (!el) return;
    const k = Math.min(el.clientWidth / width, el.clientHeight / height);
    setFit(k);
    setView({ k, x: (el.clientWidth - width * k) / 2, y: (el.clientHeight - height * k) / 2 });
  };
  useLayoutEffect(() => {
    fitView();
  }, [width, height]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onResize = () => fitView();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  // Only jumps asked for while this map is shown; an older one must not move a freshly opened map.
  const applied = useRef(focus?.nonce);
  useEffect(() => {
    const el = box.current;
    if (!focus || !el || focus.nonce === applied.current) return;
    applied.current = focus.nonce;
    const k = Math.max(view.k, fit * 3);
    setView({ k, x: el.clientWidth / 2 - focus.x * k, y: el.clientHeight / 2 - focus.y * k });
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      setView((current) => {
        const k = Math.min(fit * 40, Math.max(fit * 0.8, current.k * Math.exp(-event.deltaY * 0.0015)));
        return { k, x: px - ((px - current.x) / current.k) * k, y: py - ((py - current.y) / current.k) * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [fit]);

  const zoom = view.k / fit;
  return (
    <div
      ref={box}
      className="map"
      data-zoom={zoom < 1.8 ? "far" : zoom < 4 ? "mid" : "near"}
      onPointerDown={(event) => {
        drag.current = { x: event.clientX, y: event.clientY, moved: false };
        (event.target as Element).setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (!start) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (!start.moved && Math.hypot(dx, dy) < 4) return;
        start.moved = true;
        drag.current = { x: event.clientX, y: event.clientY, moved: true };
        setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
      }}
      onPointerUp={(event) => {
        const start = drag.current;
        drag.current = null;
        if (!start || start.moved || !box.current) return;
        const rect = box.current.getBoundingClientRect();
        onPick((event.clientX - rect.left - view.x) / view.k, (event.clientY - rect.top - view.y) / view.k);
      }}
    >
      <div className="map-canvas" style={{ width, height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }} dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="map-tools">
        <button type="button" onClick={() => setView((v) => ({ ...v, k: v.k * 1.4, x: v.x - ((box.current!.clientWidth / 2 - v.x) * 0.4), y: v.y - ((box.current!.clientHeight / 2 - v.y) * 0.4) }))} aria-label="+">
          +
        </button>
        <button type="button" onClick={() => setView((v) => ({ ...v, k: v.k / 1.4, x: v.x + ((box.current!.clientWidth / 2 - v.x) * (1 - 1 / 1.4)), y: v.y + ((box.current!.clientHeight / 2 - v.y) * (1 - 1 / 1.4)) }))} aria-label="−">
          −
        </button>
        <button type="button" onClick={fitView} aria-label="fit">
          ⤢
        </button>
      </div>
    </div>
  );
}
