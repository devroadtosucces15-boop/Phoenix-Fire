// Uploads the Phoenix card backgrounds and poses (and optionally the club kit reference) to a deployed Worker.
//   API=https://<worker> TOKEN=<owner or manager session token> [KIT=/path/to/kit-photo.jpg] node phoenix/card-looks/seed.mjs
import fs from 'node:fs';
const { API, TOKEN, KIT } = process.env;
if (!API || !TOKEN) { console.error('Set API and TOKEN.'); process.exit(1); }
const dir = new URL('.', import.meta.url).pathname;
const post = async (path, body, type) => { const r = await fetch(API + path, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': type }, body }); const t = await r.text(); if (!r.ok) throw new Error(path + ' ' + r.status + ' ' + t); return t; };
const BGS = [['Ember Night', 'ember-night.png'], ['Gold Crest', 'gold-crest.png'], ['Phoenix Rise', 'phoenix-rise.png']];
const POSES = [['Hero stance', 'standing tall with arms crossed and a confident smile'], ['Flex', 'flexing both arms, proud grin'], ['Point to crest', 'pointing at the club crest on the chest with one hand'], ['Victory', 'one fist raised in celebration'], ['Ball under foot', 'one foot resting on a football, hands on hips']];
// poses reuse a background image as their thumbnail (the server needs an image per template)
for (const [name, file] of BGS) console.log('bg', name, await post(`/api/cards/templates/upload?${new URLSearchParams({ kind: 'bg', name, tier: 'free' })}`, fs.readFileSync(dir + file), 'image/png'));
for (const [name, prompt] of POSES) console.log('pose', name, await post(`/api/cards/templates/upload?${new URLSearchParams({ kind: 'pose', name, tier: 'free', prompt })}`, fs.readFileSync(dir + 'ember-night.png'), 'image/png'));
if (KIT) { const b = fs.readFileSync(KIT); const type = b[0] === 0x89 ? 'image/png' : 'image/jpeg'; console.log('kit', await post('/api/cards/kit', b, type)); }
