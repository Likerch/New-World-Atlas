// The map viewport: wheel to zoom around the cursor, drag to pan (or, for a globe, to turn it), click to pick a place.
// The SVG is drawn once per render and moved with a CSS transform, so panning stays smooth on large maps.
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

export function MapView({ svg, overlay, width, height, focus, onPick, onDrag, onDragEnd, zoomRange = [0.8, 40] }: { svg: string; overlay: string; width: number; height: number; focus: Focus | null; onPick: (x: number, y: number) => void; onDrag?: (dx: number, dy: number) => void; onDragEnd?: () => void; zoomRange?: [number, number] }) {
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
        const k = Math.min(fit * zoomRange[1], Math.max(fit * zoomRange[0], current.k * Math.exp(-event.deltaY * 0.0015)));
        return { k, x: px - ((px - current.x) / current.k) * k, y: py - ((py - current.y) / current.k) * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [fit, zoomRange[0], zoomRange[1]]); // eslint-disable-line react-hooks/exhaustive-deps

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
        if (onDrag) onDrag(dx / view.k, dy / view.k);
        else setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
      }}
      onPointerUp={(event) => {
        const start = drag.current;
        drag.current = null;
        if (start?.moved) onDragEnd?.();
        if (!start || start.moved || !box.current) return;
        const rect = box.current.getBoundingClientRect();
        onPick((event.clientX - rect.left - view.x) / view.k, (event.clientY - rect.top - view.y) / view.k);
      }}
    >
      <div className="map-canvas" style={{ width, height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        <div dangerouslySetInnerHTML={{ __html: svg }} />
        {overlay ? <svg className="map-overlay" viewBox={`0 0 ${width} ${height}`} width={width} height={height} dangerouslySetInnerHTML={{ __html: overlay }} /> : null}
      </div>
      <div className="map-tools">
        <button type="button" onClick={() => setView((v) => {
              const k = Math.min(fit * zoomRange[1], v.k * 1.4);
              const cx = box.current!.clientWidth / 2,
                cy = box.current!.clientHeight / 2;
              return { k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k };
            })} aria-label="+">
          +
        </button>
        <button type="button" onClick={() => setView((v) => {
              const k = Math.max(fit * zoomRange[0], v.k / 1.4);
              const cx = box.current!.clientWidth / 2,
                cy = box.current!.clientHeight / 2;
              return { k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k };
            })} aria-label="−">
          −
        </button>
        <button type="button" onClick={fitView} aria-label="fit">
          ⤢
        </button>
      </div>
    </div>
  );
}
