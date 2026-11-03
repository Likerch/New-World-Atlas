// People, factions and rumours: run with `npm test`.
import assert from "node:assert/strict";
import { createLanguage, createRng, makeFactions, makeNpc, crowdOf, roleFits, rumoursOf, type Hearsay } from "../src/core/index";

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

const tongue = createLanguage(createRng("people"));

test("the same place and post give the same person; the age decides who can be there", () => {
  const a = makeNpc("city:x/landmark-3/owner", tongue, "innkeeper");
  assert.deepEqual(makeNpc("city:x/landmark-3/owner", tongue, "innkeeper"), a);
  assert.notEqual(makeNpc("city:x/landmark-4/owner", tongue, "innkeeper").name, a.name);
  assert.ok(!roleFits("hacker", "medieval") && roleFits("hacker", "cyberpunk") && !roleFits("mage", "modern"));
  const crowd = crowdOf("town", tongue, ["smith", "hacker", "priest"], 5, "medieval");
  assert.equal(crowd.length, 5);
  assert.ok(crowd.every((npc) => npc.role !== "hacker"));
});

test("factions have leaders of their own kind, and their quarrels go both ways", () => {
  const factions = makeFactions("city:y", tongue, 5, "cyberpunk");
  assert.equal(factions.length, 5);
  for (const faction of factions) {
    assert.equal(faction.leader.faction, faction.id);
    for (const rival of faction.rivals) assert.ok(factions.find((item) => item.id === rival)!.rivals.includes(faction.id));
  }
  assert.ok(factions.every((faction) => ["corporation", "gang", "syndicate", "rebels", "cult"].includes(faction.kind)));
});

test("three rumours, and exactly one of them is false", () => {
  const truths: Hearsay[] = [
    { key: "rumour.danger", vars: { who: "@monster.troll", where: "Kezar" } },
    { key: "rumour.treasure", vars: { what: "@treasure.gems", where: "Kezar" } },
    { key: "rumour.history", vars: { event: "A fire", years: 12 } },
  ];
  const lies: Hearsay[] = [{ key: "rumour.danger", vars: { who: "@monster.lich", where: "Kezar" } }];
  const told = rumoursOf("place", truths, lies);
  assert.equal(told.length, 3);
  assert.equal(told.filter((item) => !item.true).length, 1);
  assert.deepEqual(rumoursOf("place", truths, lies), told);
});

console.log(`people: ${passed} regressions passed`);
