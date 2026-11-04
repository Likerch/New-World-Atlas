// Lessons inside the app: the catalog of lessons over every part of the Atlas, and the coach that walks the GM through
// one, step by step. Each step lights up the real button or panel it speaks of, shows the move of the mouse or the keys
// it needs and, where it asks the GM to do something, moves on by itself once that is done. The lessons themselves are
// data (lessons.ts); this is how they are shown.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { T } from "./i18n";
import { Modal } from "./Modal";
import { GROUPS, LESSONS, type Gesture, type Lesson, type Pair } from "./lessons";

/** A lesson's words in the reader's language. */
export const say = (t: T, pair: Pair) => pair[t.locale === "ru" ? 1 : 0];

const DONE_KEY = "atlas.lessons";

/** The lessons this browser has been through. */
export function finishedLessons(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(DONE_KEY) ?? "[]");
    return Array.isArray(saved) ? saved.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function markFinished(id: string) {
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify([...new Set([...finishedLessons(), id])]));
  } catch {
    // A private window: the mark holds until the page is closed.
  }
}

/** The catalog: every lesson by its part of the Atlas, what it teaches, and which are done. */
export function Lessons({ t, welcome, onStart, onClose }: { t: T; welcome: boolean; onStart: (lesson: Lesson) => void; onClose: () => void }) {
  const done = finishedLessons();
  const count = LESSONS.filter((lesson) => done.includes(lesson.id)).length;
  const next = LESSONS.find((lesson) => !done.includes(lesson.id));
  return (
    <Modal className="lessons" label={t("lesson.title")} onClose={onClose}>
      <div className="modal-head">
        <h2>🎓 {t("lesson.title")}</h2>
        <button type="button" className="ghost" onClick={onClose} aria-label={t("action.close")}>
          ✕
        </button>
      </div>
      <p>{t(welcome ? "lesson.welcome" : "lesson.about")}</p>
      <div className="lesson-progress">
        <progress max={LESSONS.length} value={count} />
        <span className="muted">{t("lesson.progress", { done: count, all: LESSONS.length })}</span>
        {next ? (
          <button type="button" className="primary" onClick={() => onStart(next)}>
            {count ? t("lesson.continue", { name: say(t, next.title) }) : t("lesson.begin")} →
          </button>
        ) : null}
      </div>
      {GROUPS.map((group) => (
        <section key={group.id} className="lesson-group">
          <h3>{say(t, group.title)}</h3>
          <div className="lesson-cards">
            {LESSONS.filter((lesson) => lesson.group === group.id).map((lesson) => (
              <button key={lesson.id} type="button" className={done.includes(lesson.id) ? "lesson-card done" : "lesson-card"} onClick={() => onStart(lesson)}>
                <span className="lesson-icon" aria-hidden="true">
                  {lesson.icon}
                </span>
                <span className="grow">
                  <b>{say(t, lesson.title)}</b>
                  <small>{say(t, lesson.about)}</small>
                  <small className="muted">
                    {t("lesson.steps", { n: lesson.steps.length })}
                    {done.includes(lesson.id) ? ` · ✓ ${t("lesson.passed")}` : ""}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
      <p className="muted">{t("lesson.hint")}</p>
    </Modal>
  );
}

/** A mouse (or a hand) doing the move a step asks for, drawn and moving. */
function GestureIcon({ kind }: { kind: Gesture }) {
  return (
    <svg className={`gesture gesture-${kind}`} viewBox="0 0 48 64" width="40" height="54" aria-hidden="true">
      <g className="gesture-mouse">
        <rect x="10" y="10" width="28" height="44" rx="14" className="gesture-body" />
        <path d="M24 10v16M10 26h28" className="gesture-line" />
        <path d="M24 10a14 14 0 0 0-14 14v2h14z" className="gesture-left" />
        <path d="M24 10a14 14 0 0 1 14 14v2H24z" className="gesture-right" />
        <rect x="22" y="15" width="4" height="7" rx="2" className="gesture-wheel" />
      </g>
      {kind === "wheel" ? <path d="M24 2l-4 5h8zM24 62l-4-5h8z" className="gesture-arrows" /> : null}
      {kind === "drag" ? <path d="M2 34h8M38 34h8M5 31l-3 3 3 3M43 31l3 3-3 3" className="gesture-trail" /> : null}
    </svg>
  );
}

/** Where the card goes: beside the lit element where there is room, else at the bottom of the screen. */
function placeCard(target: DOMRect | null, w: number, h: number) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const gap = 14;
  const m = 10;
  let left = (W - w) / 2;
  let top = H - h - 24;
  if (target) {
    const middleX = target.left + target.width / 2 - w / 2;
    const middleY = target.top + target.height / 2 - h / 2;
    if (H - target.bottom - gap >= h + m) [left, top] = [middleX, target.bottom + gap];
    else if (target.top - gap >= h + m) [left, top] = [middleX, target.top - gap - h];
    else if (W - target.right - gap >= w + m) [left, top] = [target.right + gap, middleY];
    else if (target.left - gap >= w + m) [left, top] = [target.left - gap - w, middleY];
  }
  return { left: Math.max(m, Math.min(W - w - m, left)), top: Math.max(m, Math.min(H - h - m, top)) };
}

/** The first match of a selector that is on screen. */
function findShown(selector: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) if (el.getClientRects().length) return el;
  return null;
}

export type Run = { id: string; step: number; from?: string; demo?: string };

/** The coach over the app: the lit element and the card of the step. `step` -1 is the lesson's start card (when it
 * borrows a demo world), the step past the last is its end card. */
export function Coach({
  t,
  lesson,
  step,
  demoName,
  fromName,
  onStep,
  onDemo,
  onBack,
  onNext,
  onCatalog,
  onClose,
}: {
  t: T;
  lesson: Lesson;
  step: number;
  /** The demo world the lesson borrows when the open world is of another kind. */
  demoName: string;
  /** The world the GM came from, when the lesson borrowed a demo world. */
  fromName?: string;
  onStep: (step: number) => void;
  onDemo: () => void;
  onBack: () => void;
  onNext?: () => void;
  onCatalog: () => void;
  onClose: () => void;
}) {
  const current = step >= 0 ? lesson.steps[step] : undefined;
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [host, setHost] = useState<HTMLElement>(document.body);
  // Whether the step's task waits for the GM, has just been done, or was so already when the step came.
  const [status, setStatus] = useState<"wait" | "done" | "already">("wait");
  const card = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState({ left: 0, top: 0 });
  // Moving back must not be undone by a step that skips itself when its task is already done.
  const forward = useRef(true);
  const go = (next: number) => {
    forward.current = next > step;
    onStep(next);
  };

  useEffect(() => {
    if (step === lesson.steps.length) markFinished(lesson.id);
  }, [lesson.id, lesson.steps.length, step]);

  useEffect(() => {
    setStatus("wait");
    if (!current) return;
    if (forward.current && current.pass && current.done?.()) {
      onStep(step + 1);
      return;
    }
    // What is so already when the step comes was not the GM's doing here: a step that only gets the screen there is
    // passed over; another one says its task is done already and waits for «Next».
    let already = !current.pass && !!current.done?.();
    if (already) setStatus("already");
    let ready = !current.before;
    let seen: string | undefined;
    let scrolled = false;
    let timer = 0;
    // The first moment of a step is the screen settling (the level the lesson shows opening, the map taking its
    // place): what changes then is not the GM's doing either.
    const started = Date.now();
    const tick = () => {
      if (!ready) ready = current.before!() !== false;
      const settling = Date.now() - started < (current.before ? 1500 : 300);
      if (seen === undefined || settling) seen = current.change?.();
      const target = current.target ? findShown(current.target) : null;
      if (target && !scrolled) {
        target.scrollIntoView({ block: "nearest", inline: "nearest" });
        scrolled = true;
      }
      setRect(target ? target.getBoundingClientRect() : null);
      const dialogs = document.querySelectorAll<HTMLElement>("dialog[open]");
      setHost(dialogs.length ? dialogs[dialogs.length - 1] : document.body);
      if (already || timer) return;
      const finished = current.done?.() || (current.change && seen !== undefined && current.change() !== seen);
      if (!finished) return;
      if (settling) {
        if (current.pass && forward.current) return onStep(step + 1);
        already = true;
        return setStatus("already");
      }
      setStatus("done");
      timer = window.setTimeout(() => go(step + 1), 900);
    };
    tick();
    const every = window.setInterval(tick, 250);
    return () => {
      window.clearInterval(every);
      window.clearTimeout(timer);
    };
    // The step is the whole of what this depends on.
  }, [lesson.id, step]);

  useLayoutEffect(() => {
    const box = card.current;
    if (box) setSpot(placeCard(rect, box.offsetWidth, box.offsetHeight));
  }, [rect, step, host, status]);

  const next = onNext ? LESSONS[LESSONS.indexOf(lesson) + 1] : undefined;
  const head = (
    <div className="coach-head">
      <span className="coach-icon">{lesson.icon}</span>
      <b className="grow">{say(t, lesson.title)}</b>
      {current ? <span className="muted">{t("lesson.of", { n: step + 1, all: lesson.steps.length })}</span> : null}
      <button type="button" className="ghost" onClick={onClose} aria-label={t("lesson.leave")} title={t("lesson.leave")}>
        ✕
      </button>
    </div>
  );

  let body;
  if (step < 0) {
    body = (
      <>
        {head}
        <p>{say(t, lesson.about)}</p>
        <p className="muted">{t("lesson.needsDemo", { name: demoName })}</p>
        <div className="row-buttons">
          <button type="button" className="ghost" onClick={onClose}>
            {t("lesson.cancel")}
          </button>
          <button type="button" className="primary" onClick={onDemo}>
            {t("lesson.openDemo")}
          </button>
        </div>
      </>
    );
  } else if (!current) {
    body = (
      <>
        {head}
        <h3>🎉 {t("lesson.finished")}</h3>
        <p>{t("lesson.finishedText")}</p>
        <div className="row-buttons">
          <button type="button" onClick={onCatalog}>
            🎓 {t("lesson.all")}
          </button>
          {fromName ? (
            <button type="button" onClick={onBack}>
              ↩ {t("lesson.backTo", { name: fromName })}
            </button>
          ) : null}
          {next ? (
            <button type="button" className="primary" onClick={onNext}>
              {say(t, next.title)} →
            </button>
          ) : (
            <button type="button" className="primary" onClick={onClose}>
              {t("lesson.close")}
            </button>
          )}
        </div>
      </>
    );
  } else {
    body = (
      <>
        {head}
        <div className="coach-step">
          {current.gesture ? <GestureIcon kind={current.gesture} /> : null}
          <div className="grow">
            <h3>{say(t, current.title)}</h3>
            <p>{say(t, current.text)}</p>
            {current.keys ? (
              <p className="coach-keys">
                {current.keys.map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </p>
            ) : null}
            {current.done || current.change ? (
              <p className={status === "wait" ? "coach-task" : "coach-task done"}>{status === "wait" ? `👉 ${t("lesson.yourTurn")}` : `✓ ${t(status === "done" ? "lesson.welldone" : "lesson.already")}`}</p>
            ) : null}
            {current.target && !rect ? <p className="muted">{t("lesson.notShown")}</p> : null}
          </div>
        </div>
        <div className="coach-dots" aria-hidden="true">
          {lesson.steps.map((_, k) => (
            <span key={k} className={k === step ? "on" : k < step ? "past" : ""} />
          ))}
        </div>
        <div className="row-buttons">
          {step > 0 ? (
            <button type="button" className="ghost" onClick={() => go(step - 1)}>
              ← {t("lesson.back")}
            </button>
          ) : null}
          <span className="grow" />
          <button type="button" className="primary" onClick={() => go(step + 1)}>
            {step === lesson.steps.length - 1 ? t("lesson.finish") : `${(current.done || current.change) && status === "wait" ? t("lesson.skip") : t("lesson.next")} →`}
          </button>
        </div>
      </>
    );
  }

  return createPortal(
    <div className="coach" role="dialog" aria-label={say(t, lesson.title)}>
      {!current ? <div className="coach-shade" /> : rect ? <div className="coach-spot" style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }} /> : null}
      <div ref={card} className="coach-card" style={spot}>
        {body}
      </div>
    </div>,
    host,
  );
}
