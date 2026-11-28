import assert from 'node:assert/strict';
import { FORMATIONS, eventMessage } from '../bot/events.js';
import { hostBody, formationChoices } from '../bot/host.js';
import { normalizeFormationSlots, solveSuggestedXI, rollCallSvg, lineupStageSvg } from '../bot/hostgraphic.js';
import { positionPickerMessage, rescheduleMessage } from '../bot/hostflow.js';
import { cleanPref, PREF_MAX } from '../bot/prefpos.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

console.log('host-telemetry.test.mjs');

test('FORMATIONS includes all 30 shapes including both 3-5-2 (CDM) and 3-5-2 (CAM)', () => {
  assert.ok(FORMATIONS['3-5-2'], '3-5-2 exists');
  assert.ok(FORMATIONS['3-5-2 (CAM)'], '3-5-2 (CAM) exists');
  assert.ok(Object.keys(FORMATIONS).length >= 30, `expected >= 30 formations, got ${Object.keys(FORMATIONS).length}`);
  assert.deepEqual(FORMATIONS['3-5-2'].map(([s]) => s).sort(), ['CAM', 'CB', 'GK', 'LCB', 'LDM', 'LM', 'LS', 'RCB', 'RDM', 'RM', 'RS'], 'club 3-5-2 is LM LDM RDM RM / CAM');
assert.ok(FORMATIONS['3-5-2 (CDM)'].some(([s]) => s === 'CDM'), 'old wing-back 3-5-2 (CDM) still exists');
  assert.ok(FORMATIONS['3-5-2 (CAM)'].some(([s]) => s === 'CAM'), '3-5-2 (CAM) has CAM');
  assert.ok(formationChoices('3-5-2').length >= 2, 'formationChoices returns both 3-5-2 variants');
});

test('hostBody removes player cap and accepts 3-5-2 (CAM)', () => {
  const b = hostBody({ mode: 'league', kind: 'session', formation: '3-5-2 (CAM)' }, 'UTC', { date: '2026-12-01', time: '21:00' });
  assert.equal(b.formation, '3-5-2 (CAM)');
  assert.deepEqual(b.needs, {});
  assert.ok(b.duration >= 240);
});

test('cleanPref supports up to 3 formation-exact positions (1 Primary + 2 Flex)', () => {
  assert.equal(PREF_MAX, 3);
  assert.deepEqual(cleanPref(['ls', 'rs', 'cam', 'gk']), ['LS', 'RS', 'CAM']);
});

test('3-pass Suggested XI solver performs 1-step flex shift to fill uncovered slot', () => {
  const slots = normalizeFormationSlots(FORMATIONS['3-5-2 (CDM)']);
  const rsvps = [
    { user_id: '1', name: 'Mateo', status: 'yes', prefs: ['LS', 'RS'] },
    { user_id: '2', name: 'Diego', status: 'yes', prefs: ['LS', 'RS'] },
    { user_id: '3', name: 'Eli', status: 'yes', prefs: ['RS', 'RWB'] },
  ];
  const stats = new Map([['1', { ovr: 8.7 }], ['2', { ovr: 8.3 }], ['3', { ovr: 8.1 }]]);
  const res = solveSuggestedXI(slots, rsvps, stats);
  assert.equal(res.assigned.LS.p.name, 'Mateo');
  assert.equal(res.assigned.RS.p.name, 'Diego');
  assert.equal(res.assigned.RWB.p.name, 'Eli');
  // club 3-5-2 (CAM): a wing-back pick lands on the matching wide midfield slot
  const cam = solveSuggestedXI(normalizeFormationSlots(FORMATIONS['3-5-2']), rsvps, stats);
  assert.equal(cam.assigned.RM.p.name, 'Eli');
});

test('rollCallSvg renders matte-black + glowing gold + max-3 avatar overflow + >12 roster overflow', () => {
  const slots = normalizeFormationSlots(FORMATIONS['3-5-2']);
  const rsvps = Array.from({ length: 15 }, (_, i) => ({
    user_id: String(i + 1), name: `Player${i + 1}`, status: 'yes',
    prefs: i < 5 ? ['LS', 'RS'] : [slots[(i % (slots.length - 1)) + 1].id],
    form: ['W', 'W', 'D', 'W', 'L'],
  }));
  const svg = rollCallSvg({ formation: '3-5-2', slots, rsvps, avgOvr: 8.34, winForm: 74 });
  assert.ok(svg.includes('#0b0c0e'), 'matte black background');
  assert.ok(svg.includes('opacity="0.34"'), 'dimmed icon watermark inside circle');
  assert.ok(svg.includes('+2'), 'max-3 avatar overflow +2 circle for 5 LS players');
  assert.ok(svg.includes('+3 MORE SIGNED UP'), 'roster overflow bar for 15 players');
  assert.ok(!/norex/i.test(svg), 'zero NOREX branding');
});

test('lineupStageSvg distinguishes call vs checkin vs final with chemistry links and gold rings', () => {
  const slots = normalizeFormationSlots(FORMATIONS['3-5-2']);
  const assigned = Object.fromEntries(slots.map((s, i) => [s.id, { p: { id: String(i + 1), name: `P${i + 1}`, ovr: 8.4, stat: '10G' }, mode: 'primary' }]));
  const callSvg = lineupStageSvg({ mode: 'call', formation: '3-5-2', slots, assigned, bench: [] });
  const ciSvg = lineupStageSvg({ mode: 'checkin', formation: '3-5-2', slots, assigned, bench: [], checkinMap: new Map([['1', 'ready'], ['2', 'late']]) });
  const finalSvg = lineupStageSvg({ mode: 'final', formation: '3-5-2', slots, assigned, bench: [], avgOvr: 8.4, captainId: '1' });
  assert.ok(callSvg.includes('PROVISIONAL') && !callSvg.includes('stroke-opacity="0.58"'));
  assert.ok(ciSvg.includes('IN LOBBY') && ciSvg.includes('LATE'));
  assert.ok(finalSvg.includes('FINAL XI') && finalSvg.includes('stroke-opacity="0.58"'));
});

test('positionPickerMessage and rescheduleMessage build valid Discord Components v2', () => {
  const picker = positionPickerMessage(42, '3-5-2 (CAM)', ['LS', 'CAM']);
  const rows = picker.components[0].components.filter((c) => c.type === 1);
  assert.equal(rows.length, 4, '3 position rows (5+5+1) + 1 action row');
  const rs = rescheduleMessage(42, Date.UTC(2026, 10, 27, 21, 0));
  const txt = JSON.stringify(rs);
  assert.ok(txt.includes('-1 Day') && txt.includes('+1 Day') && txt.includes('-15m') && txt.includes('+1 hr'));
});

test('eventMessage builds Pro Telemetry Roll Call with Squad Hub accessory and Manager Controls', () => {
  const env = { SITE_URL: 'https://phoenixfire.gg/', FEATURES: JSON.stringify({ discordRsvp: 'members' }) };
  const msg = eventMessage(env, { id: 9, type: 'league', start: Date.now() + 3600e3, duration: 240, formation: '3-5-2 (CAM)', status: 'scheduled' }, []);
  const s = JSON.stringify(msg);
  assert.ok(s.includes('PHOENIX FIRE · MATCHDAY'), 'timezone-neutral branding');
  assert.ok(s.includes('3-5-2 (CAM)'), 'formation in header');
  assert.ok(s.includes('MANAGER CONTROLS'), 'manager controls section');
  assert.ok(s.includes('pf:h:9:override'), 'override button present');
  assert.ok(s.includes('pf:h:9:xi'), 'Suggested XI button present');
  assert.ok(s.includes('pf:h:9:roster'), 'Roster button present');
});

console.log(`All ${passed} tests passed.`);
