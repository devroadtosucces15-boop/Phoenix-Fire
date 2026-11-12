// Builder sandbox maths (roadmap PB.2). Pure functions, no DOM: used by builder.js in the browser and by
// tests/builder.test.mjs in Node. Everything reads the game-rules dataset (NXGame.load(), PB.1). Numbers EA has
// not published and managers have not entered yet fall back to PREVIEW values – the page says so clearly.
(() => {
  // Placeholder rules until the in-game values are entered (portal → Game rules → changed values).
  const PREVIEW = {
    apPerLevel: [20, 3], // index 0 = AP you start with at level 1, then AP gained per level (last value repeats)
    apCosts: [{ upTo: 70, cost: 1 }, { upTo: 80, cost: 2 }, { upTo: 90, cost: 3 }, { upTo: 99, cost: 4 }],
    slots: { playstyles: 3, plus: 1, facilities: 3 },
    body: { height: { min: 160, max: 200, def: 180 }, weight: { min: 55, max: 105, def: 75 } },
    positions: { GK: ['GK'], DEF: ['CB', 'LB', 'RB'], MID: ['CDM', 'CM', 'CAM'], FWD: ['ST', 'LW', 'RW'] },
    base: { GK: { goalkeeping: 62, other: 40 }, DEF: { defending: 58, physical: 58, other: 50 }, MID: { passing: 58, dribbling: 56, other: 50 }, FWD: { shooting: 58, pace: 58, other: 50 }, outfieldGk: 12 },
  };

  // With an archetype, groups flagged keeperOnly (Goalkeeping) are dropped for outfield archetypes, as in the game. Without one the full
  // list comes back: share links index into it, so its order must never depend on the archetype.
  const attrsOf = (g, arch) => (g.attributeGroups || []).filter((grp) => !(arch && grp.keeperOnly && arch.group !== 'GK')).flatMap((grp) => grp.attributes.map((name) => ({ name, group: grp.id })));
  // g.aliases maps retired archetype ids to their replacement (Engine became Disruptor), so old share links and saved builds still open.
  const archId = (g, id) => g.aliases?.[id] || id;
  const archOf = (g, id) => (g.archetypes || []).find((a) => a.id === archId(g, id)) || (g.archetypes || [])[0];

  // What's real and what's a placeholder, per dataset.
  function status(g, arch) {
    return {
      ap: !!g.apPerLevel?.length,
      costs: !!(g.apCosts?.length || (g.costTiers && Object.keys(g.costTiers).length)),
      base: !!(arch && Object.keys(arch.base || {}).length),
      get preview() { return !(this.ap && this.costs && this.base); },
    };
  }

  // arch.base[attr] is either a plain number (legacy/manual entry) or { base, max } (community/real data,
  // where the archetype's own ceiling for that attribute can sit below the global scale).
  function baseOf(g, arch) {
    const real = arch?.base || {};
    const grp = arch?.group || 'MID';
    const p = PREVIEW.base[grp] || PREVIEW.base.MID;
    const out = {};
    for (const a of attrsOf(g)) {
      const r = real[a.name];
      if (r != null) out[a.name] = +(typeof r === 'object' ? r.base : r);
      else if (a.group === 'goalkeeping' && grp !== 'GK') out[a.name] = PREVIEW.base.outfieldGk;
      else out[a.name] = p[a.group] ?? p.other;
    }
    return out;
  }

  const capOf = (g) => Math.max(1, +g.levelCap?.value || 1);
  const maxAttr = (g) => { const c = g.apCosts?.length ? g.apCosts : PREVIEW.apCosts; return c[c.length - 1].upTo; };
  // Per-archetype, per-attribute ceiling if the dataset has one (real data), else the global scale top.
  const attrTop = (g, arch, name) => { const r = arch?.base?.[name]; return r && typeof r === 'object' && r.max != null ? +r.max : maxAttr(g); };

  // Total AP available at a level: start value + one entry per level gained.
  function apAt(g, level) {
    const t = g.apPerLevel?.length ? g.apPerLevel : PREVIEW.apPerLevel;
    let sum = 0;
    for (let i = 0; i < level; i++) sum += +(t[Math.min(i, t.length - 1)] || 0);
    return sum;
  }

  // AP cost to raise an attribute from value v to v + 1, against the single global curve (tiers get dearer
  // near the top). Kept as the simple global-curve utility; evaluate()/canAdd()/fit() use stepCostFor below,
  // which picks the attribute's own tier when the dataset has per-attribute cost tiers (real data).
  function stepCost(g, v) {
    const tiers = g.apCosts?.length ? g.apCosts : PREVIEW.apCosts;
    const t = tiers.find((x) => v + 1 <= x.upTo);
    return t ? +t.cost : Infinity;
  }
  function costOf(g, from, added) {
    let c = 0;
    for (let i = 0; i < added; i++) c += stepCost(g, from + i);
    return c;
  }

  // Real data (costTiers + attributeCosts, roadmap PB.1 community import): each attribute is assigned a named
  // tier (range bands, e.g. { from, to, cost }) per archetype. Falls back to the global apCosts/PREVIEW curve
  // (stepCost) when the dataset has no per-attribute tier for this archetype/attribute.
  function stepCostFor(g, arch, name, v) {
    const tierKey = g.attributeCosts?.[arch?.id]?.[name];
    const bands = tierKey && g.costTiers?.[tierKey];
    if (!bands?.length) return stepCost(g, v);
    const b = bands.find((x) => v < x.to);
    return b ? +b.cost : Infinity;
  }
  function costOfFor(g, arch, name, from, added) {
    let c = 0;
    for (let i = 0; i < added; i++) c += stepCostFor(g, arch, name, from + i);
    return c;
  }

  // Free boosts from Masteries unlocked at this archetype level (EA notes, e.g. Finisher L10 +1 FIN/+1 COM).
  function masteryBonus(g, archId, level) {
    const out = {};
    for (const m of g.masteries || []) if (m.archetype === archId && level >= m.level) for (const [k, v] of Object.entries(m.bonus || {})) out[k] = (out[k] || 0) + v;
    return out;
  }

  // Dataset shapes (all optional, entered by managers in Game rules → changed values, or from a community
  // import per roadmap PB.1):
  //   playstyles      [{ id, name, icon?, desc?, plus?: true if it can be PlayStyle+ }]
  //   specializations manual shape: [{ id, name, desc?, archetypes?: [ids] (empty = all), bonus: { attr: n } }]
  //                   real-data shape: [{ id, name, archetype, thresholds: { attr: n }, grantsPlaystyle?, perk?, desc? }]
  //                   (both read by specsFor(); desc is shown as-is, so a real-data entry should pre-render its
  //                   own human-readable text - e.g. "Needs Jumping 90 … → grants X + perk: Y")
  //   facilities      [{ id, name, desc?, bonus: { attr: n } }]
  //   slots           { playstyles, plus, facilities }
  //   body            { height: {min,max,def}, weight: {min,max,def}, heightMods: [{ from, to, mods }], weightMods: [...] }
  //   archetypes[].positions ['ST', 'LW'] (else a default per group)
  //   archetypes[].base[attr] either a plain number, or { base, max } when the archetype has its own ceiling
  //   costTiers       { tierName: [{ from, to, cost }] } - per-attribute range-cost bands (real data)
  //   attributeCosts  { archetypeId: { attr: tierName } } - which tier each attribute uses, per archetype
  const slotsOf = (g) => ({ ...PREVIEW.slots, ...(g.slots || {}) });
  // Height / weight limits: the archetype's own range when the dataset has one (arch.body), else the global one.
  const rangeOf = (g, k, arch) => {
    const r = { ...PREVIEW.body[k], ...(g.body?.[k] || {}) }, a = arch?.body, K = k === 'height' ? 'Height' : 'Weight';
    return a && a['min' + K] != null ? { min: a['min' + K], max: a['max' + K], def: a['default' + K] ?? Math.round((a['min' + K] + a['max' + K]) / 2) } : r;
  };

  // Skill Moves / Weak Foot (1-5 stars) cost AP in the real rules: arch.skillMoves = { base, max, cost: { star: AP to reach it } }.
  const starsOf = (arch, k) => ({ base: arch?.[k]?.base ?? 3, max: arch?.[k]?.max ?? 3, cost: arch?.[k]?.cost || {} });
  // AP to move from one star count to another (negative = refund).
  function starCost(arch, k, from, to) {
    if (from === to) return 0;
    const { cost } = starsOf(arch, k), [lo, hi] = from < to ? [from, to] : [to, from];
    let s = 0;
    for (let i = lo + 1; i <= hi; i++) s += +cost[i] || 0;
    return from < to ? s : -s;
  }
  const starValue = (arch, k, v) => { const r = starsOf(arch, k); return Math.min(r.max, Math.max(r.base, v == null || v === '' ? r.base : Math.round(+v) || r.base)); };

  // Facilities (real data: g.facilityRules + g.facilities[{ costTier, attributes, boosts: [★1, ★2, ★3] }]): each has up to 3 stars, paid
  // from a K budget that grows with the level, separate from AP. Boosts add to attribute values.
  const facOn = (g) => !!g.facilityRules && !!g.facilities?.length;
  const facBudget = (g, level) => { const r = g.facilityRules?.budget; return r ? r.base + Math.floor((level - 1) * r.perLevel) : 0; };
  const facCost = (g, f, from, to) => { let s = 0; for (let l = from + 1; l <= to; l++) s += +g.facilityRules?.costs?.[f.costTier]?.[l - 1] || 0; return s; };
  const facSpend = (g, fl) => Object.entries(fl || {}).reduce((s, [id, l]) => { const f = (g.facilities || []).find((x) => x.id === id); return s + (f ? facCost(g, f, 0, l) : 0); }, 0);

  // Height / weight shift six attributes (g.body.modifier): each factor is -3…+3 steps from the middle of the archetype's size range.
  const bodyStep = (v, lo, hi) => { const half = (hi - lo) / 2; return half <= 0 ? 0 : Math.round(3 * (v - (lo + hi) / 2) / half); };
  function bodyMods(g, arch, h, w) {
    const m = g.body?.modifier; if (!m) return { height: {}, weight: {} };
    const H = rangeOf(g, 'height', arch), Wt = rangeOf(g, 'weight', arch), s = bodyStep(h, H.min, H.max), o = bodyStep(w, Wt.min, Wt.max);
    const height = {}, weight = {};
    for (const [attr, [hc, wc]] of Object.entries(m.attributes || {})) { if (hc * s) height[attr] = hc * s; if (wc * o) weight[attr] = wc * o; }
    return { height, weight, s, o };
  }
  // Acceleration type (Explosive / Lengthy / Controlled) from the final Agility, Strength and Acceleration and the height.
  function accelType(g, v, h) {
    const r = g.body?.accelerate; if (!r) return null;
    const ex = r.explosive, le = r.lengthy;
    if (ex && v.Acceleration >= ex.minAcceleration && v.Agility >= ex.minAgility && v.Agility - v.Strength >= ex.agilityOverStrength && h <= ex.maxHeight) return 'Explosive';
    if (le && v.Strength >= le.minStrength && v.Strength - v.Agility >= le.strengthOverAgility && v.Acceleration >= le.minAcceleration && h >= le.minHeight) return 'Lengthy';
    return r.default || 'Controlled';
  }
  // Real data (roadmap PB.1 community import) ties a spec to one archetype via s.archetype; older/manual
  // entries may still use the s.archetypes list shape (empty = all archetypes) - both are supported.
  const specsFor = (g, archId) => (g.specializations || []).filter((s) => (s.archetype ? s.archetype === archId : (!s.archetypes?.length || s.archetypes.includes(archId))));
  const bandMods = (list, v) => (list || []).find((r) => v >= r.from && v <= r.to)?.mods || {};

  // Clean a build's choices against the data (unknown ids dropped, slot limits kept, body clamped).
  function choices(g, b) {
    const sl = slotsOf(g);
    const ids = new Set((g.playstyles || []).map((p) => p.id));
    const canPlus = new Set((g.playstyles || []).filter((p) => p.plus !== false).map((p) => p.id));
    const plus = [...new Set((b.plus || []).filter((id) => canPlus.has(id)))].slice(0, sl.plus);
    const ps = [...new Set((b.ps || []).filter((id) => ids.has(id) && !plus.includes(id)))].slice(0, sl.playstyles);
    const arch = archOf(g, b.arch);
    const sp = specsFor(g, arch?.id).some((s) => s.id === b.sp) ? b.sp : null;
    const fids = new Set((g.facilities || []).map((f) => f.id));
    // real data: facilities carry a star level (fl: { id: 1…max }); older datasets keep a flat list (fa) capped by the slot count
    let fa, fl = {};
    if (facOn(g)) {
      const mx = g.facilityRules.maxLevel || 3;
      for (const [id, l] of Object.entries(b.fl || {})) if (fids.has(id) && +l > 0) fl[id] = Math.min(mx, Math.round(+l));
      fa = Object.keys(fl);
    } else fa = [...new Set((b.fa || []).filter((id) => fids.has(id)))].slice(0, sl.facilities);
    const H = rangeOf(g, 'height', arch), Wt = rangeOf(g, 'weight', arch);
    const clamp = (v, r) => Math.min(r.max, Math.max(r.min, Math.round(+v || r.def)));
    return { ps, plus, sp, fa, fl, h: clamp(b.h, H), w: clamp(b.w, Wt) };
  }

  // Attribute changes from specialization, facilities, height and weight – each listed by source for badges.
  function modsOf(g, b) {
    const c = choices(g, b);
    const out = {};
    const add = (src, mods) => { for (const [k, v] of Object.entries(mods || {})) if (+v) (out[k] ||= []).push([src, +v]); };
    const sp = (g.specializations || []).find((s) => s.id === c.sp);
    if (sp) add(sp.name, sp.bonus);
    for (const id of c.fa) {
      const f = (g.facilities || []).find((x) => x.id === id);
      if (!f) continue;
      if (facOn(g)) add(f.name, Object.fromEntries((f.attributes || []).map((a) => [a, f.boosts?.[c.fl[id] - 1] || 0])));
      else add(f.name, f.bonus);
    }
    const bm = bodyMods(g, archOf(g, b.arch), c.h, c.w);
    add('Height', { ...bandMods(g.body?.heightMods, c.h), ...bm.height });
    add('Weight', { ...bandMods(g.body?.weightMods, c.w), ...bm.weight });
    return out;
  }

  // Full evaluation of a build: { arch, level, spent: {attr: points} } → values, AP used/left, face stats, OVR.
  function evaluate(g, b) {
    const arch = archOf(g, b.arch);
    const level = Math.min(capOf(g), Math.max(1, b.level | 0));
    const base = baseOf(g, arch);
    const bonus = masteryBonus(g, arch?.id, level);
    const mods = modsOf(g, { ...b, arch: arch?.id });
    const top = maxAttr(g); // global scale (bar width etc.) - per-attribute ceiling is row.top below
    const rows = attrsOf(g, arch).map((a) => {
      const rowTop = attrTop(g, arch, a.name);
      const add = Math.min(Math.max(0, b.spent?.[a.name] | 0), Math.max(0, rowTop - base[a.name])); // points stop at the archetype's ceiling
      const bon = bonus[a.name] || 0;
      const mod = (mods[a.name] || []).reduce((s, [, v]) => s + v, 0);
      // Bought value = base + points. Body size, facilities and specializations then add on top, and only the global 99 stops that.
      return { ...a, base: base[a.name], add, bonus: bon, mod, modFrom: mods[a.name] || [], top: rowTop, value: Math.max(1, Math.min(top, base[a.name] + add + bon + mod)), cost: costOfFor(g, arch, a.name, base[a.name], add), sig: (arch?.signature || []).includes(a.name) };
    });
    const stars = { skillMoves: starValue(arch, 'skillMoves', b.sm), weakFoot: starValue(arch, 'weakFoot', b.wf) };
    const starRows = Object.fromEntries(['skillMoves', 'weakFoot'].map((k) => [k, { ...starsOf(arch, k), value: stars[k], cost: starCost(arch, k, starsOf(arch, k).base, stars[k]) }]));
    const total = apAt(g, level);
    const used = rows.reduce((s, r) => s + r.cost, 0) + starRows.skillMoves.cost + starRows.weakFoot.cost;
    const byGroup = {};
    for (const r of rows) (byGroup[r.group] ||= []).push(r.value);
    const avg = (k) => (byGroup[k]?.length ? Math.round(byGroup[k].reduce((s, v) => s + v, 0) / byGroup[k].length) : 0);
    const val = (n) => rows.find((r) => r.name === n)?.value ?? 0;
    // Real data (g.faceStats): face stats are weighted attribute means, OVR is the archetype's weighting of them (plain mean when it has none).
    const fsd = g.faceStats && (arch?.group === 'GK' ? g.faceStats.keeper : g.faceStats.outfield);
    const faceW = fsd?.map((d) => { let r = 0, n = 0; for (const [k, w] of Object.entries(d.weights)) { const x = rows.find((y) => y.name === k); if (x) { r += x.value * w; n += w; } } return [d.label, n > 0 ? Math.round(r / n) : 0]; });
    const face0 = arch?.group === 'GK'
      ? [['DIV', val('GK Diving')], ['HAN', val('GK Handling')], ['KIC', val('GK Kicking')], ['REF', val('GK Reflexes')], ['SPD', avg('pace')], ['POS', val('GK Positioning')]]
      : [['PAC', avg('pace')], ['SHO', avg('shooting')], ['PAS', avg('passing')], ['DRI', avg('dribbling')], ['DEF', avg('defending')], ['PHY', avg('physical')]];
    const W = { GK: { goalkeeping: 0.9, physical: 0.1 }, DEF: { defending: 0.45, physical: 0.2, pace: 0.15, passing: 0.2 }, MID: { passing: 0.35, dribbling: 0.3, shooting: 0.15, defending: 0.1, physical: 0.1 }, FWD: { shooting: 0.45, dribbling: 0.25, pace: 0.2, physical: 0.1 } }[arch?.group || 'MID'];
    const ovrW = arch?.group === 'GK' ? g.faceStats?.keeperOvrWeights : arch?.ovrWeights;
    const ovr = faceW ? (() => { let r = 0, n = 0; faceW.forEach(([, v], i) => { const w = ovrW ? ovrW[fsd[i].key] ?? 0 : 1; r += v * w; n += w; }); return n > 0 ? Math.round(r / n) : 0; })()
      : Math.round(Object.entries(W).reduce((s, [k, w]) => s + avg(k) * w, 0));
    const face = faceW || face0;
    // Position fit: how well the attribute mix suits each position the archetype plays (estimate, 0–99).
    const PW = { GK: { goalkeeping: 1 }, CB: { defending: 0.5, physical: 0.3, pace: 0.2 }, LB: { pace: 0.35, defending: 0.35, passing: 0.3 }, RB: { pace: 0.35, defending: 0.35, passing: 0.3 },
      CDM: { defending: 0.45, passing: 0.35, physical: 0.2 }, CM: { passing: 0.45, dribbling: 0.3, defending: 0.25 }, CAM: { passing: 0.4, dribbling: 0.35, shooting: 0.25 },
      LM: { pace: 0.35, dribbling: 0.35, passing: 0.3 }, RM: { pace: 0.35, dribbling: 0.35, passing: 0.3 },
      ST: { shooting: 0.5, pace: 0.25, physical: 0.25 }, CF: { shooting: 0.4, dribbling: 0.35, passing: 0.25 }, LW: { pace: 0.35, dribbling: 0.4, shooting: 0.25 }, RW: { pace: 0.35, dribbling: 0.4, shooting: 0.25 } };
    PW.LWB = PW.LB; PW.RWB = PW.RB;
    const posFit = (arch?.positions?.length ? arch.positions : PREVIEW.positions[arch?.group || 'MID'])
      .map((pos) => [pos, Math.round(Object.entries(PW[pos] || W).reduce((s, [k, w]) => s + avg(k) * w, 0))])
      .sort((x, y) => y[1] - x[1]);
    const ch = choices(g, { ...b, arch: arch?.id });
    const fv = Object.fromEntries(rows.map((r) => [r.name, r.value]));
    const fSpent = facOn(g) ? facSpend(g, ch.fl) : 0, fBudget = facOn(g) ? facBudget(g, level) : 0;
    return { arch, level, cap: capOf(g), rows, total, used, left: total - used, face, ovr, fit: posFit, top, choices: ch, slots: slotsOf(g), status: status(g, arch),
      stars: starRows, accel: accelType(g, fv, ch.h), facility: { on: facOn(g), budget: fBudget, spent: fSpent, left: fBudget - fSpent }, body: { height: rangeOf(g, 'height', arch), weight: rangeOf(g, 'weight', arch) } };
  }

  // Can the stars go to n? Returns the AP it costs (negative = refund) or null when out of range / not enough AP.
  function canStar(ev, k, n) {
    const r = ev.stars[k];
    if (!r || n < r.base || n > r.max) return null;
    const c = starCost(ev.arch, k, r.value, n);
    return c <= ev.left ? c : null;
  }

  // Can one more point go into this attribute? Returns the AP cost or null (at max / not enough AP).
  function canAdd(g, ev, name) {
    const r = ev.rows.find((x) => x.name === name);
    if (!r || r.value >= r.top) return null;
    const c = stepCostFor(g, ev.arch, name, r.base + r.add);
    return c <= ev.left ? c : null;
  }

  // Lowering the level can leave the build over budget: take points back from the dearest end until it fits.
  function fit(g, b) {
    const spent = { ...b.spent };
    let ev = evaluate(g, { ...b, spent });
    while (ev.left < 0) {
      const r = ev.rows.filter((x) => x.add > 0).sort((x, y) => stepCostFor(g, ev.arch, y.name, y.base + y.add - 1) - stepCostFor(g, ev.arch, x.name, x.base + x.add - 1))[0];
      if (!r) break;
      spent[r.name] = r.add - 1;
      if (!spent[r.name]) delete spent[r.name];
      ev = evaluate(g, { ...b, spent });
    }
    // still over once every point is back: Skill Moves / Weak Foot stars go back to the archetype's starting stars
    if (ev.left < 0 && (b.sm != null || b.wf != null)) return { ...b, spent, sm: undefined, wf: undefined };
    return { ...b, spent };
  }

  // Share links: #a=<archetype>&l=<level>&p=<attrIndex>x<points>.…&v=<dataset version>
  function encode(g, b) {
    const list = attrsOf(g);
    const p = list.map((a, i) => (b.spent?.[a.name] ? `${i.toString(36)}x${b.spent[a.name]}` : '')).filter(Boolean).join('.');
    const q = new URLSearchParams({ a: b.arch, l: String(b.level) });
    if (p) q.set('p', p);
    const c = choices(g, b);
    const idx = (list, ids) => ids.map((id) => list.findIndex((x) => x.id === id)).filter((i) => i >= 0).map((i) => i.toString(36)).join('.');
    if (c.ps.length) q.set('ps', idx(g.playstyles, c.ps));
    if (c.plus.length) q.set('pp', idx(g.playstyles, c.plus));
    if (c.sp) q.set('sp', c.sp);
    if (c.fa.length && !facOn(g)) q.set('fa', idx(g.facilities, c.fa));
    if (b.h) q.set('h', String(c.h));
    if (b.w) q.set('w', String(c.w));
    if (b.sm != null) q.set('sm', String(b.sm));
    if (b.wf != null) q.set('wf', String(b.wf));
    const fl = Object.entries(c.fl || {}).map(([id, l]) => `${(g.facilities || []).findIndex((x) => x.id === id).toString(36)}x${l}`).join('.');
    if (fl) q.set('fl', fl);
    q.set('v', g.version || '');
    return q.toString();
  }
  function decode(g, str) {
    const q = new URLSearchParams(String(str || '').replace(/^#/, ''));
    const arch = archOf(g, q.get('a'));
    if (!arch || !q.get('a')) return null;
    const list = attrsOf(g);
    const spent = {};
    for (const part of (q.get('p') || '').split('.')) {
      const m = part.match(/^([0-9a-z]+)x(\d{1,3})$/);
      const a = m && list[parseInt(m[1], 36)];
      if (a) spent[a.name] = +m[2];
    }
    const level = Math.min(capOf(g), Math.max(1, parseInt(q.get('l'), 10) || capOf(g)));
    const ids = (list, str) => (str || '').split('.').map((x) => (list || [])[parseInt(x, 36)]?.id).filter(Boolean);
    const fl = {};
    for (const part of (q.get('fl') || '').split('.')) { const m = part.match(/^([0-9a-z]+)x([1-3])$/); const f = m && (g.facilities || [])[parseInt(m[1], 36)]; if (f) fl[f.id] = +m[2]; }
    const extra = { ps: ids(g.playstyles, q.get('ps')), plus: ids(g.playstyles, q.get('pp')), sp: q.get('sp') || null, fa: ids(g.facilities, q.get('fa')), fl, h: +q.get('h') || null, w: +q.get('w') || null };
    const c = choices(g, { arch: arch.id, ...extra });
    const sm = q.get('sm') == null ? undefined : starValue(arch, 'skillMoves', q.get('sm')), wf = q.get('wf') == null ? undefined : starValue(arch, 'weakFoot', q.get('wf'));
    return { ...fit(g, { arch: arch.id, level, spent, ...c, sm, wf, h: extra.h && c.h, w: extra.w && c.w }), version: q.get('v') || null };
  }

  const api = { PREVIEW, archId, starsOf, starCost, starValue, canStar, facOn, facBudget, facCost, facSpend, bodyMods, bodyStep, accelType, slotsOf, rangeOf, specsFor, choices, modsOf, attrsOf, archOf, status, baseOf, capOf, attrTop, apAt, stepCost, costOf, stepCostFor, costOfFor, masteryBonus, evaluate, canAdd, fit, encode, decode };
  globalThis.NXBuildMath = api;
})();
