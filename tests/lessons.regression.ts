// The lessons inside the app: every step speaks both languages, a lesson that borrows a demo world borrows one that
// exists and fits it, and every word the coach says is in the dictionary. Run with `npm test`.
import assert from "node:assert/strict";
import { translator } from "../src/app/i18n";
import { GROUPS, LESSONS } from "../src/app/lessons";
import { DEMOS } from "../src/app/WorldLibrary";

let passed = 0;
function test(title: string, run: () => void) {
  try {
    run();
    passed++;
  } catch (error) {
    console.error(`✗ ${title}`);
    throw error;
  }
}

test("lessons have their own ids, a known group each, and every group has lessons", () => {
  assert.equal(new Set(LESSONS.map((lesson) => lesson.id)).size, LESSONS.length);
  for (const lesson of LESSONS) assert.ok(GROUPS.some((group) => group.id === lesson.group), lesson.id);
  for (const group of GROUPS) assert.ok(LESSONS.some((lesson) => lesson.group === group.id), group.id);
});

test("every step says something in English and in Russian", () => {
  for (const lesson of LESSONS) {
    assert.ok(lesson.steps.length > 0, lesson.id);
    for (const pair of [lesson.title, lesson.about, ...lesson.steps.flatMap((step) => [step.title, step.text])]) {
      assert.equal(pair.length, 2, lesson.id);
      for (const words of pair) assert.ok(words.trim() && !words.includes("{{"), `${lesson.id}: ${JSON.stringify(pair)}`);
    }
  }
});

test("a lesson that needs a kind of world borrows a demo world of that kind", () => {
  for (const lesson of LESSONS.filter((item) => item.tops)) {
    const demo = DEMOS.find((item) => item.id === lesson.demo);
    assert.ok(demo, `${lesson.id}: no demo world`);
    assert.ok(lesson.tops!.includes(demo.top), `${lesson.id}: the demo world ${demo.id} does not fit`);
  }
});

test("the coach's words and the demo worlds' names are in both dictionaries", () => {
  const keys = [
    ...["title", "welcome", "about", "progress", "begin", "continue", "steps", "passed", "hint", "of", "leave", "needsDemo", "cancel", "openDemo", "finished", "finishedText", "all", "backTo", "close", "welldone", "already", "yourTurn", "notShown", "finish", "skip", "back", "next"].map((key) => `lesson.${key}`),
    "help.lessons",
    ...DEMOS.flatMap((demo) => [`demo.${demo.id}`, `demo.${demo.id}.hint`]),
  ];
  for (const locale of ["en", "ru"] as const) {
    const t = translator(locale);
    for (const key of keys) assert.notEqual(t(key), key, `${locale}: ${key}`);
  }
});

console.log(`lessons: ${passed} regressions passed`);
