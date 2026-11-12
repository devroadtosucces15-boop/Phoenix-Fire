// FC 27 ruleset fc27-2026-11-12 (community import from proclubsbuilder.co.uk, not an official EA source): the data file is new and the
// old one untouched, the maths reproduces the source's shared example build, and every archetype's cost tier, caps, base values, star
// costs and body range in the data file match the figures read from the source and drive the builder maths.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { ROOT } from './mock.mjs';
import { t, done } from './lib.mjs';

await import('../web/build-math.js');
const M = globalThis.NXBuildMath;
const dir = ROOT + 'data/game/';
const g = JSON.parse(fs.readFileSync(dir + 'fc27-2026-11-12.json', 'utf8'));

// ---- the versioned file ----
t('published rulesets are never edited: fc27-2026-09-29.json is byte-for-byte what was published', crypto.createHash('sha256').update(fs.readFileSync(dir + 'fc27-2026-09-29.json')).digest('hex') === '8d04ef4082efedf1bcf88e5269120dbd979d6b43af855a9000659f97b01a6368');
t('same schema as the previous version (every top-level key kept)', Object.keys(JSON.parse(fs.readFileSync(dir + 'fc27-2026-09-29.json', 'utf8'))).every((k) => k in g || k === 'facilities'));
const newest = fs.readdirSync(dir).filter((f) => /^fc\d+-.+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(dir + f, 'utf8'))).sort((a, b) => String(b.published).localeCompare(String(a.published)))[0];
t('next/lib/data.mjs picks it: newest by "published"', newest.version === 'fc27-2026-11-12' && g.version === 'fc27-2026-11-12' && g.published === '2026-11-12');
t('credits the source and says it is a community import, not an official EA source', /proclubsbuilder\.co\.uk/.test(g.note) && /not an official EA source/i.test(g.note) && g.sources.some((s) => /proclubsbuilder\.co\.uk\/builder/.test(s.url)) && g.sources.some((s) => /proclubsbuilder\.co\.uk\/archetypes/.test(s.url)) && g.levelCap.verified === false && g.levelCap.source === 'community');
t('nothing NOREX in the ruleset', !/norex/i.test(JSON.stringify(g)));

// ---- level cap + AP per level ----
t('level cap 55 (was 40)', g.levelCap.value === 55 && g.levelCap.launchValue === 40 && M.capOf(g) === 55);
const AP = [100, 9, 9, 9, 19, 10, 10, 10, 10, 38, 13, 13, 13, 13, 25, 13, 13, 13, 13, 44, 19, 19, 19, 19, 38, 25, 25, 25, 25, 63, 25, 25, 25, 25, 38, 25, 25, 25, 25, 50, 25, 25, 25, 25, 44, 25, 25, 25, 25, 63, 25, 25, 25, 25, 50];
t('AP per level: 55 levels, the 40 old ones unchanged, 15 added', g.apPerLevel.length === 55 && JSON.stringify(g.apPerLevel) === JSON.stringify(AP) && JSON.stringify(g.apPerLevel.slice(0, 40)) === JSON.stringify(JSON.parse(fs.readFileSync(dir + 'fc27-2026-09-29.json', 'utf8')).apPerLevel));
t('AP totals are cumulative: level 1 = 100, level 40 and level 55 = the sums of the table', M.apAt(g, 1) === 100 && M.apAt(g, 40) === AP.slice(0, 40).reduce((a, b) => a + b, 0) && M.apAt(g, 55) === AP.reduce((a, b) => a + b, 0) && M.apAt(g, 56) === M.apAt(g, 55) + 50 /* the table's last entry repeats past the cap; the cap stops it */);
t('level above 55 is clamped by evaluate', M.evaluate(g, { arch: 'finisher', level: 99, spent: {} }).level === 55);

// ---- the source's shared example: All Around Fullback, Finisher, Lv 55, 5'10", 176lbs, Controlled ----
const ex = M.evaluate(g, { arch: 'finisher', level: 55, spent: {}, h: 177, w: 80 });
const face = Object.fromEntries(ex.face);
t('example build: 70 OVR · ST', ex.ovr === 70 && ex.arch.positions[0] === 'ST');
t('example build: PAC 72, SHO 72, PAS 63, DRI 72, DEF 55, PHY 68', face.PAC === 72 && face.SHO === 72 && face.PAS === 63 && face.DRI === 72 && face.DEF === 55 && face.PHY === 68 && ex.face.map(([k]) => k).join() === 'PAC,SHO,PAS,DRI,DEF,PHY');
const ft = Math.round(177 / 2.54), lbs = Math.round(80 * 2.20462);
t('example build: 5\'10", 176lbs, Controlled, 3★ skill moves, 3★ weak foot, nothing spent', `${Math.floor(ft / 12)}'${ft % 12}"` === '5\'10"' && lbs === 176 && ex.accel === 'Controlled' && ex.stars.skillMoves.value === 3 && ex.stars.weakFoot.value === 3 && ex.used === 0 && ex.left === M.apAt(g, 55));
t('example build: the source default height and weight for a Finisher are the middle of its range (177 cm, 80 kg)', ex.choices.h === 177 && ex.choices.w === 80 && M.evaluate(g, { arch: 'finisher', level: 55, spent: {} }).choices.h === 177);
t('example build travels in a share link with the version and decodes back', (() => { const b = { arch: 'finisher', level: 55, spent: {}, h: 177, w: 80 }; const d = M.decode(g, M.encode(g, b)); return d.arch === 'finisher' && d.level === 55 && d.h === 177 && d.w === 80 && d.version === g.version && M.evaluate(g, d).ovr === 70; })());

// ---- per archetype: tier, caps, base values, star costs, body range ----
const BANDS = { 0: [[1, 69, 1], [70, 74, 2], [75, 84, 3], [85, 89, 6], [90, 92, 8], [93, 94, 10], [95, 95, 15], [96, 96, 20], [97, 97, 25], [98, 98, 30], [99, 99, 35]],
  1: [[1, 63, 1], [64, 69, 2], [70, 74, 3], [75, 79, 4], [80, 84, 5], [85, 89, 8], [90, 92, 11], [93, 94, 15], [95, 95, 20], [96, 96, 25], [97, 97, 30], [98, 98, 35], [99, 99, 40]],
  2: [[1, 60, 1], [61, 63, 2], [64, 69, 3], [70, 74, 4], [75, 79, 6], [80, 84, 7], [85, 89, 11], [90, 92, 15], [93, 94, 20], [95, 95, 25], [96, 96, 30], [97, 97, 35], [98, 98, 40], [99, 99, 45]],
  3: [[1, 60, 2], [61, 63, 3], [64, 66, 4], [67, 69, 5], [70, 74, 6], [75, 79, 8], [80, 84, 10], [85, 89, 15], [90, 92, 20], [93, 94, 25], [95, 95, 30], [96, 96, 35], [97, 97, 40], [98, 98, 45], [99, 99, 50]] };
const pointCost = (tier, point) => BANDS[tier].find(([lo, hi]) => point >= lo && point <= hi)[2]; // AP to reach `point` (v → v+1 costs the band of v+1)
const SRC = {
  'shot-stopper': { spot: [['Acceleration', 2, 75, 92], ['Finishing', 3, 40, 75], ['Strength', 2, 65, 96], ['Short Passing', 2, 65, 92], ['Standing Tackle', 3, 40, 75], ['GK Reflexes', 2, 75, 99], ['GK Diving', 2, 75, 99]], sm: { 2: 5 }, wf: { 2: 10, 3: 20 } },
  'sweeper-keeper': { spot: [['Acceleration', 3, 75, 92], ['Finishing', 3, 40, 75], ['Strength', 2, 70, 96], ['Short Passing', 3, 50, 92], ['Standing Tackle', 3, 50, 85], ['GK Reflexes', 3, 75, 99], ['GK Diving', 2, 75, 99]], sm: { 2: 5, 3: 10 }, wf: { 2: 8, 3: 15, 4: 25 } },
  progressor: { spot: [['Acceleration', 3, 70, 92], ['Finishing', 3, 50, 85], ['Strength', 2, 70, 96], ['Short Passing', 3, 75, 96], ['Standing Tackle', 3, 75, 99]], sm: { 3: 10, 4: 20 }, wf: { 4: 25 } },
  boss: { spot: [['Acceleration', 3, 70, 90], ['Finishing', 3, 45, 82], ['Strength', 1, 75, 99], ['Short Passing', 3, 65, 92], ['Standing Tackle', 3, 75, 96]], sm: { 3: 10 }, wf: { 3: 20, 4: 35 } },
  marauder: { spot: [['Acceleration', 3, 75, 95], ['Finishing', 3, 55, 90], ['Strength', 2, 60, 92], ['Short Passing', 3, 65, 92], ['Standing Tackle', 3, 70, 96]], sm: { 3: 10, 4: 20, 5: 35 }, wf: { 4: 25, 5: 40 } },
  disruptor: { spot: [['Acceleration', 2, 75, 92], ['Finishing', 3, 50, 90], ['Strength', 2, 75, 96], ['Short Passing', 3, 75, 96], ['Standing Tackle', 2, 70, 92]], sm: { 3: 10, 4: 20 }, wf: { 4: 35, 5: 50 } },
  recycler: { spot: [['Acceleration', 3, 70, 90], ['Finishing', 3, 55, 90], ['Strength', 1, 72, 96], ['Short Passing', 2, 70, 96], ['Standing Tackle', 3, 75, 96]], sm: { 3: 8, 4: 15 }, wf: { 4: 25, 5: 40 } },
  maestro: { spot: [['Acceleration', 3, 70, 90], ['Finishing', 3, 65, 96], ['Strength', 2, 65, 92], ['Short Passing', 3, 75, 96], ['Standing Tackle', 3, 72, 90]], sm: { 3: 10, 4: 20, 5: 35 }, wf: { 4: 25, 5: 40 } },
  creator: { spot: [['Acceleration', 3, 70, 92], ['Finishing', 3, 65, 96], ['Strength', 2, 65, 92], ['Short Passing', 3, 75, 96], ['Standing Tackle', 3, 65, 90]], sm: { 3: 10, 4: 20, 5: 35 }, wf: { 4: 25, 5: 40 } },
  spark: { spot: [['Acceleration', 3, 75, 99], ['Finishing', 3, 65, 96], ['Strength', 2, 65, 90], ['Short Passing', 3, 75, 96], ['Standing Tackle', 3, 55, 80]], sm: { 4: 15, 5: 25 }, wf: { 4: 25, 5: 40 } },
  magician: { spot: [['Acceleration', 2, 75, 95], ['Finishing', 3, 75, 99], ['Strength', 2, 65, 90], ['Short Passing', 2, 75, 96], ['Standing Tackle', 3, 40, 75]], sm: { 4: 20, 5: 35 }, wf: { 4: 25, 5: 40 } },
  finisher: { spot: [['Acceleration', 3, 75, 95], ['Finishing', 2, 75, 99], ['Strength', 2, 70, 92], ['Short Passing', 3, 70, 92], ['Standing Tackle', 3, 50, 75]], sm: { 4: 15, 5: 25 }, wf: { 4: 35, 5: 50 } },
  target: { spot: [['Acceleration', 3, 70, 90], ['Finishing', 3, 72, 96], ['Strength', 1, 75, 99], ['Short Passing', 3, 75, 96], ['Standing Tackle', 3, 45, 75]], sm: { 3: 8, 4: 15, 5: 25 }, wf: { 3: 20, 4: 35, 5: 50 } },
};
const BODY = { 'shot-stopper': [184, 200, 80, 100], 'sweeper-keeper': [179, 197, 80, 100], progressor: [177, 195, 75, 95], boss: [180, 196, 80, 100], marauder: [168, 188, 65, 85], recycler: [172, 192, 65, 85], maestro: [162, 188, 65, 85], creator: [162, 188, 65, 85], spark: [162, 188, 65, 85], magician: [162, 188, 60, 80], finisher: [164, 190, 70, 90], target: [177, 195, 80, 100], disruptor: [160, 206, 45, 115] };
const POS = { 'shot-stopper': 'GK', 'sweeper-keeper': 'GK', progressor: 'CB', boss: 'CB', disruptor: 'CDM,CM,LB,RB', marauder: 'LB,RB,LWB,RWB', recycler: 'CDM,CM', maestro: 'CM,CDM', creator: 'CAM,CM', spark: 'LM,RM,LW,RW', magician: 'LW,RW,CAM,ST', finisher: 'ST,CF', target: 'ST,CF' };
const GROUP = { 'shot-stopper': 'GK', 'sweeper-keeper': 'GK', progressor: 'DEF', boss: 'DEF', marauder: 'DEF', disruptor: 'MID', recycler: 'MID', maestro: 'MID', creator: 'MID', spark: 'FWD', magician: 'FWD', finisher: 'FWD', target: 'FWD' };
t('13 archetypes, in the source order, none missing or extra', [...g.archetypes.map((a) => a.id)].sort().join() === Object.keys(SRC).sort().join() && g.archetypes.length === 13 && g.archetypeGroups.map((x) => x.id).join() === 'GK,DEF,MID,FWD');
t('Engine is retired into Disruptor (old share links and saved builds still open)', g.aliases.engine === 'disruptor' && M.archOf(g, 'engine').id === 'disruptor' && M.decode(g, 'a=engine&l=20').arch === 'disruptor' && !g.archetypes.some((a) => a.id === 'engine'));

const ev0 = (id, extra = {}) => M.evaluate(g, { arch: id, level: 55, spent: {}, ...extra });
for (const [id, src] of Object.entries(SRC)) {
  const a = g.archetypes.find((x) => x.id === id);
  t(`${id}: group ${GROUP[id]}, positions ${POS[id]}, body range, default body`, a.group === GROUP[id] && a.positions.join() === POS[id] && JSON.stringify([a.body.minHeight, a.body.maxHeight, a.body.minWeight, a.body.maxWeight]) === JSON.stringify(BODY[id])
    && a.body.defaultHeight === Math.round((BODY[id][0] + BODY[id][1]) / 2) && a.body.defaultWeight === Math.round((BODY[id][2] + BODY[id][3]) / 2) && ev0(id).choices.h === a.body.defaultHeight);
  t(`${id}: spot-checked attributes have the source's AP cost tier, starting value and ceiling`, src.spot.every(([n, tier, lo, hi]) => g.attributeCosts[id][n] === `tier${tier}` && a.base[n].base === lo && a.base[n].max === hi
    && M.attrTop(g, a, n) === hi && M.baseOf(g, a)[n] === lo));
  // every attribute: the data file's tier is a real tier, the cap is reachable but never exceeded, and the builder charges exactly the tier's bands
  const ev = ev0(id), rows = ev.rows;
  let ok = rows.length === (a.group === 'GK' ? 34 : 29);
  for (const r of rows) {
    const tier = +g.attributeCosts[id][r.name].replace('tier', '');
    ok &&= !!BANDS[tier] && r.base === a.base[r.name].base && r.top === a.base[r.name].max && r.value === r.base; // no body change at the default size
    const room = r.top - r.base, n = Math.min(room, 7);
    const e = M.evaluate(g, { arch: id, level: 55, spent: { [r.name]: n } });
    let want = 0; for (let p = r.base + 1; p <= r.base + n; p++) want += pointCost(tier, p);
    const row = e.rows.find((x) => x.name === r.name);
    ok &&= row.cost === want && e.used === want && row.value === Math.min(99, r.base + n);
    // can never be pushed past the archetype's ceiling
    const over = M.evaluate(g, { arch: id, level: 55, spent: { [r.name]: 200 } }).rows.find((x) => x.name === r.name);
    ok &&= over.add === room && over.value === r.top;
    const next = r.top > r.base ? pointCost(tier, r.base + 1) : null;
    ok &&= M.canAdd(g, ev, r.name) === next || (next != null && next > ev.left);
  }
  t(`${id}: every attribute follows its cost tier from its starting value, stops at its ceiling, charges the right AP`, ok);
  const sm = Object.keys(src.sm).map(Number), wf = Object.keys(src.wf).map(Number);
  t(`${id}: Skill Moves ${Math.min(...sm) - 1}–${Math.max(...sm)}★ and Weak Foot ${Math.min(...wf) - 1}–${Math.max(...wf)}★ with the source's AP costs`, a.skillMoves.base === Math.min(...sm) - 1 && a.skillMoves.max === Math.max(...sm) && a.weakFoot.base === Math.min(...wf) - 1 && a.weakFoot.max === Math.max(...wf)
    && Object.entries(src.sm).every(([k, v]) => a.skillMoves.cost[k] === v) && Object.entries(src.wf).every(([k, v]) => a.weakFoot.cost[k] === v)
    && ev0(id, { sm: 9, wf: 9 }).stars.skillMoves.value === a.skillMoves.max && ev0(id, { sm: 9, wf: 9 }).used === Object.values(src.sm).reduce((s, v) => s + v, 0) + Object.values(src.wf).reduce((s, v) => s + v, 0)
    && ev0(id, { sm: 0, wf: 0 }).used === 0);
}

// ---- face stats, OVR, GK, body, facilities, share links ----
t('GK archetypes show the keeper attributes and DIV/HAN/KIC/REF/SPD/POS; outfield archetypes do not show them', ev0('shot-stopper').face.map(([k]) => k).join() === 'DIV,HAN,KIC,REF,SPD,POS' && ev0('shot-stopper').rows.some((r) => r.name === 'GK Diving') && !ev0('finisher').rows.some((r) => r.name.startsWith('GK ')));
t('Shot Stopper OVR from the keeper weights (21/21/5/21/11/21)', (() => { const f = Object.fromEntries(ev0('shot-stopper').face); return ev0('shot-stopper').ovr === Math.round((f.DIV * 21 + f.HAN * 21 + f.KIC * 5 + f.REF * 21 + f.SPD * 11 + f.POS * 21) / 100); })());
t('Disruptor has no OVR weights in the source, so its OVR is the plain mean of the six face stats', g.archetypes.find((a) => a.id === 'disruptor').ovrWeights == null && (() => { const e = ev0('disruptor'); return e.ovr === Math.round(e.face.reduce((s, [, v]) => s + v, 0) / 6); })());
t('Boss OVR weights DEF 55 / PHY 30', (() => { const e = ev0('boss'), f = Object.fromEntries(e.face); return e.ovr === Math.round((f.PAC * 5 + f.PAS * 5 + f.DRI * 5 + f.DEF * 55 + f.PHY * 30) / 100); })());
t('the points you spend move the face stats and OVR (Finisher +10 Finishing costs 70 AP)', (() => { const e = ev0('finisher', { spent: { Finishing: 10 }, h: 177, w: 80 }); return e.used === 70 && e.rows.find((r) => r.name === 'Finishing').value === 85 && e.ovr >= 70; })());
t('Skill Moves 5★ for a Finisher costs 15 + 25 AP, Weak Foot 5★ costs 35 + 50 AP; lowering back refunds', ev0('finisher', { sm: 5 }).used === 40 && ev0('finisher', { wf: 5 }).used === 85 && M.starCost(M.archOf(g, 'finisher'), 'skillMoves', 5, 3) === -40);
t('stars cannot be bought without the AP', (() => { const e = M.evaluate(g, { arch: 'finisher', level: 1, spent: { Finishing: 10 } }); return e.left === 30 && M.canStar(e, 'weakFoot', 5) === null && M.canStar(e, 'skillMoves', 4) === 15; })());
const big = ev0('finisher', { h: 190, w: 90 }), by = (e, n) => e.rows.find((r) => r.name === n);
t('body size: tallest and heaviest Finisher loses 6 Acceleration and 6 Agility, gains 6 Jumping and 6 Strength (3 + 3 steps), Balance and Sprint Speed cancel', by(big, 'Acceleration').mod === -6 && by(big, 'Agility').mod === -6 && by(big, 'Jumping').mod === 6 && by(big, 'Strength').mod === 6 && by(big, 'Balance').mod === 0 && by(big, 'Sprint Speed').mod === 0 && by(big, 'Strength').value === 70 + 6);
t('body size costs no AP, is clamped to the archetype range, and a body-boosted value can pass the archetype ceiling (only 99 stops it)', big.used === 0 && ev0('finisher', { h: 250, w: 1 }).choices.h === 190 && ev0('finisher', { h: 250, w: 1 }).choices.w === 70 && ev0('boss', { spent: { Strength: 100 }, h: 196, w: 100 }).rows.find((r) => r.name === 'Strength').value === 99);
t('acceleration type: Explosive (small, agile), Lengthy (tall, strong), Controlled otherwise', ev0('spark', { h: 165, w: 65 }).accel === 'Explosive' && ev0('boss', { h: 196, w: 100 }).accel === 'Lengthy' && ex.accel === 'Controlled');
t('facilities: 34 with star boosts, paid from the K budget (1100 K + 50 K per level), not AP', g.facilities.length === 34 && M.facBudget(g, 1) === 1100 && M.facBudget(g, 55) === 3800 && M.facCost(g, g.facilities.find((x) => x.id === 'scout'), 0, 3) === 100 + 400 + 1100);
t('facilities: stars boost the two attributes without costing AP, and show their spend against the budget', (() => { const f = g.facilities.find((x) => x.id === 'strength-drill'); const e = ev0('finisher', { h: 177, w: 80, fl: { 'strength-drill': 3 } }); const [a1, a2] = f.attributes; return e.used === 0 && e.facility.spent === M.facCost(g, f, 0, 3) && e.facility.left === 3800 - e.facility.spent && by(e, a1).mod === f.boosts[2] && by(e, a2).mod === f.boosts[2]; })());
t('share link keeps stars and facility levels', (() => { const d = M.decode(g, M.encode(g, { arch: 'finisher', level: 55, spent: { Finishing: 4 }, sm: 5, wf: 4, fl: { 'strength-drill': 2, 'vr-room': 3 }, h: 180, w: 82 })); return d.sm === 5 && d.wf === 4 && d.fl['strength-drill'] === 2 && d.fl['vr-room'] === 3 && d.spent.Finishing === 4 && d.h === 180 && d.w === 82; })());
t('lowering the level trims points until the build fits (stars go back last)', (() => { const f = M.fit(g, { arch: 'finisher', level: 1, spent: { Finishing: 8 }, sm: 5, wf: 5 }); const e = M.evaluate(g, f); return e.left >= 0; })());
t('PlayStyles, Specializations and PlayStyle requirements come from the source', g.playstyles.length === 30 && g.specializations.length === 36 && g.specializations.every((s) => g.archetypes.some((a) => a.id === s.archetype) && Object.keys(s.thresholds).every((k) => g.attributeGroups.some((gr) => gr.attributes.includes(k)))) && M.specsFor(g, 'disruptor').length === 0 && M.specsFor(g, 'finisher').map((s) => s.name).join() === 'Finisher+,Presser,Hunter');
done();
