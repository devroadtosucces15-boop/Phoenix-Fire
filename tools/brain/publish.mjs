// Project brain: one self-contained HTML snapshot for the hosted (phone) copy. No dependencies.
//   node tools/brain/publish.mjs [--out path]      writes tools/brain/out/brain-snapshot.html (git-ignored) and prints its size and build time.
// The session then publishes that file as a PRIVATE claude.ai Artifact (PLANNING/SESSION-HANDOFF.md section 7). The hosted copy is a snapshot:
// it only changes when a session republishes it, and it says its build time. Reuses tools/brain/index.html and the same model().
// Left out on purpose: the Credentials tab and its data, the live server hooks, and every secret-shaped string.
// Brainstorm on the phone: notes go to the artifact's shared storage (db capability, collection phone-notes); dictation uses the dictation
// capability. A session pulls them into LIBRARY/inbox/ with `node tools/brain/phone-notes.mjs import <file.json>`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { model, redact, ROOT } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OUT = path.join(HERE, 'out', 'brain-snapshot.html');
export const CAPABILITIES = { db: {}, dictation: {} };
export const COLLECTION = 'phone-notes';
// Same shapes lib.mjs redacts; the finished file must contain none of them.
const SECRETISH = [/[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,}/, /gh[pousr]_[A-Za-z0-9]{20,}/, /sk-[A-Za-z0-9_-]{20,}/, /\b[0-9a-f]{32,}\b/, /\b\d{17,20}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/];

const must = (src, from, to, label) => { if (!src.includes(from)) throw new Error('publish.mjs: page changed, cannot find ' + label); return src.replace(from, () => to); };
const lineIdx = (lines, prefix, label) => { const i = lines.findIndex((l) => l.startsWith(prefix)); if (i < 0) throw new Error('publish.mjs: page changed, cannot find ' + label); return i; };

// Phone Brainstorm: replaces the local one (which posts to the local server). Shared notes live in the db capability; the repo's own ideas show read-only.
const PHONE_BRAIN = String.raw`let bsDraft='',bsSrc='typed',bsMsg='',DB=null,DICT=null,listening=false,phone=null,phoneErr='';
const PN='${COLLECTION}';
function brain(){const local=(M.inbox||[]).filter(n=>!q||JSON.stringify(n).toLowerCase().includes(q.toLowerCase())),P=(phone||[]).filter(n=>!q||JSON.stringify(n).toLowerCase().includes(q.toLowerCase()));
 const row=n=>'<div class="note '+E(n.status)+'"><div class="r"><span class="tag '+(n.status==='open'?'OPEN':n.status==='tackled'||n.status==='pulled'?'DONE':'')+'">'+E(n.status)+'</span><span class="tag">'+E(n.source)+'</span><span class="mute">'+E(new Date(n.created||n.date).toLocaleString())+'</span></div><p>'+E(n.text)+'</p>'+(n.phone&&n.status==='open'?'<div class="r"><button class="btn" data-ph-id="'+E(n.id)+'" data-to="dropped">Drop</button></div>':'')+(n.phone&&n.status==='dropped'?'<div class="r"><button class="btn" data-ph-id="'+E(n.id)+'" data-to="open">Reopen</button></div>':'')+'</div>';
 const form=DB?'<div class="bs"><label class="lab" for="bs-text">New idea from the phone</label><textarea id="bs-text" maxlength="2000" placeholder="Type a thought'+(DICT?', or press Dictate and speak':'')+'. Never put a password or key here: name it instead.">'+E(bsDraft)+'</textarea><div class="r"><button class="btn pri" id="bs-save">Save idea</button>'+(DICT?'<button class="btn'+(listening?' rec':'')+'" id="bs-mic" aria-pressed="'+listening+'">'+(listening?'Stop dictating':'Dictate')+'</button>':'<span class="mute">Dictation is not available in this view; type instead.</span>')+'<span class="mute" id="bs-msg" role="status">'+E(bsMsg)+'</span></div></div>':'<div class="banner">Phone notes need shared storage, which this view does not offer (open the page signed in to claude.ai). The ideas below are read-only.</div>';
 return form+'<p class="mute">Phone ideas are saved to this page\'s shared storage and pulled into the project inbox at the end of the next session. This hosted copy is a snapshot: the ideas below from the repo are as of the build time, not live.</p>'
 +(phoneErr?'<div class="banner">'+E(phoneErr)+'</div>':'')
 +'<h2>Phone ideas <span class="mute" style="font:400 14px var(--ui)">'+(phone?P.filter(n=>n.status==='open').length+' open':'loading')+'</span></h2>'+(phone?(P.map(row).join('')||'<p class="mute">No phone ideas yet.</p>'):'<p class="mute">Loading shared notes.</p>')
 +'<h2>Ideas in the repo <span class="mute" style="font:400 14px var(--ui)">'+local.length+' at build time, read-only</span></h2>'+(local.map(row).join('')||'<p class="mute">None.</p>');}
async function phoneInit(){const cl=window.claude;try{DB=cl&&cl.use?await cl.use('db'):null}catch{DB=null}try{DICT=cl&&cl.use?await cl.use('dictation'):null}catch{DICT=null}
 if(DB){try{DB.collection(PN).onSnapshot(s=>{phone=s.docs.map(d=>({...d.data(),id:d.id,phone:true})).sort((a,b)=>String(b.created).localeCompare(String(a.created)));phoneErr='';if(tab==='brainstorm'&&!(document.activeElement&&document.activeElement.id==='bs-text'))render()},e=>{phone=phone||[];phoneErr='Shared notes could not load ('+((e&&e.code)||'error')+').';if(tab==='brainstorm')render()})}catch(e){phone=[];phoneErr='Shared notes could not load.'}}else phone=[];
 if(tab==='brainstorm')render()}
const SECRETRE=[/gh[pousr]_[A-Za-z0-9]{20,}/,/sk-[A-Za-z0-9_-]{20,}/,/\b[0-9a-f]{32,}\b/,/\b\d{17,20}\b/,/-----BEGIN [A-Z ]*PRIVATE KEY-----/,/\b(?:token|secret|password|passwd|api[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9+/_-]{12,}/i];
document.addEventListener('click',async e=>{const b=e.target.closest('#bs-save,#bs-mic,[data-ph-id]');if(!b||!DB)return;
 if(b.id==='bs-mic'){if(!DICT)return;if(listening){try{await DICT.stop()}catch{}return}
  try{DICT.start().catch(err=>{bsMsg=(err&&err.code==='not_granted')?'Dictation was turned off; type instead.':'Dictation did not start.';listening=false;render()})}catch{bsMsg='Dictation did not start.';render()}return}
 try{if(b.id==='bs-save'){const ta=document.getElementById('bs-text');const t=(ta.value||'').replace(/\r/g,'').trim();
   if(!t){bsMsg='Write something first.';render();return}if(t.length>2000){bsMsg='Longer than 2000 characters.';render();return}if(SECRETRE.some(re=>re.test(t))){bsMsg='This looks like a secret value. Name the secret instead.';render();return}
   await DB.collection(PN).add({text:t,source:bsSrc,status:'open',created:new Date().toISOString()});bsDraft='';bsSrc='typed';bsMsg='Saved.';render()}
  else{await DB.doc(PN+'/'+b.dataset.phId).update({status:b.dataset.to});bsMsg=''}}catch(err){bsMsg='Not saved: '+((err&&err.message)||'error');render()}});
document.addEventListener('input',e=>{if(e.target.id==='bs-text')bsDraft=e.target.value});
function dictInit(){if(!window.claude||!window.claude.use)return;window.claude.use('dictation').then(d=>{if(!d)return;d.onFinal(({text})=>{const ta=document.getElementById('bs-text');bsDraft=((ta?ta.value:bsDraft)+' '+text).trim();bsSrc='dictated';render()});d.onState(({state})=>{listening=state==='listening'||state==='starting';if(tab==='brainstorm'&&!(document.activeElement&&document.activeElement.id==='bs-text'))render()})}).catch(()=>{})}
`;

export function buildSnapshot({ now = new Date() } = {}) {
  const m = model();
  delete m.credentials; // the Credentials tab is not published, nor its data
  m.generated = now.toISOString();
  // Every string goes through the same redaction the local page uses, and the JSON cannot close its own script tag.
  const data = redact(JSON.stringify(m)).replace(/</g, '\\u003c').split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029');
  JSON.parse(data);
  const crest = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'phoenix/overlay/crest-sm.png')).toString('base64');
  let html = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');

  // Page contract: the Artifact tool adds doctype, html, head and body itself.
  const title = html.match(/<title>[^<]*<\/title>/)[0];
  const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
  let body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
  body = must(body, '<img src="/crest.png" alt="">', `<img src="${crest}" alt="">`, 'crest image');
  body = must(body, '<div class="live" id="live"><i></i><span>connecting</span></div>', '<div class="live" id="live"><span class="mute" id="built"></span></div>', 'live indicator');

  const lines = body.split('\n');
  // Tabs: drop Credentials.
  let i = lineIdx(lines, 'const TABS=', 'tab list');
  lines[i] = must(lines[i], ",['credentials','Credentials']", '', 'credentials tab');
  // Brainstorm: swap the local one for the phone one.
  const a = lineIdx(lines, 'let bsDraft=', 'brainstorm start'); const b = lineIdx(lines, 'const uMeter=', 'usage start');
  lines.splice(a, b - a, PHONE_BRAIN.trimEnd());
  const c = lineIdx(lines, "document.addEventListener('click',async e=>{const b=e.target.closest('#bs-save", 'brainstorm click handler');
  const d = lineIdx(lines, "window.addEventListener('hashchange'", 'hashchange');
  lines.splice(c, d - c);
  // Render map without the credentials tab.
  for (let k = 0; k < lines.length; k++) lines[k] = lines[k].split(',credentials:creds})[tab]()').join('})[tab]()');
  // Credentials renderer and everything that builds it are removed.
  const cs = lineIdx(lines, 'function creds(){', 'credentials renderer');
  const ce = lineIdx(lines, 'const chips=', 'chips helper');
  lines.splice(cs, ce - cs);
  // Data and load: inline model, no server, no live stream, no notifications (the viewer frame offers none).
  const l = lineIdx(lines, 'async function load()', 'load');
  lines[l] = 'async function load(){M=SNAPSHOT;render()}';
  const lv = lineIdx(lines, 'function live()', 'live');
  lines[lv] = "function live(){const el=document.getElementById('built');if(el)el.textContent='Snapshot built '+new Date(M.generated).toLocaleString()+'. Updates only when a session republishes it.'}";
  const ld = lineIdx(lines, 'load();live();', 'start');
  lines[ld] = 'load();live();phoneInit();dictInit();';
  const first = lineIdx(lines, '<script>', 'script open');
  lines[first] = `<script>\nconst SNAPSHOT=${data};\ntry{Object.defineProperty(window,'Notification',{value:undefined,configurable:true})}catch{}`;
  body = lines.join('\n');
  body = must(body, ",icon:'/crest.png'", ",icon:''", 'notification icon');
  // The lede line says "refreshed"; a snapshot says when it was built.
  body = must(body, "% done · refreshed '+new Date(M.generated).toLocaleTimeString()", "% done · snapshot of '+new Date(M.generated).toLocaleString()", 'lede text');

  let out = `<meta name="claude:viewport-fit-sides" content="cover">\n${title}\n${style}\n${body.trim()}\n`;
  out = out.replace('</style>', '.live{max-width:100%;text-align:right}.live span{overflow-wrap:anywhere}</style>');
  return { html: out, generated: m.generated, bytes: Buffer.byteLength(out) };
}

// Checks the finished file; returns a list of problems (empty when clean).
export function checkSnapshot(html) {
  const bad = [];
  if (/\['credentials'|"credentials":|function creds|creds\(\)|data-tab="credentials"/.test(html)) bad.push('credentials tab or data present');
  if (/new EventSource|fetch\('\/|bsPost|src="\/|icon:'\//.test(html)) bad.push('local server hook present');
  for (const re of SECRETISH) if (re.test(html)) bad.push('secret-shaped string: ' + re);
  if (!/Snapshot built|snapshot of/.test(html)) bad.push('no build time');
  if (/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(html)) bad.push('page skeleton tags present');
  if (!/<title>[^<]+<\/title>/.test(html)) bad.push('no title');
  return bad;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = process.argv.indexOf('--out');
  const out = o > 0 ? path.resolve(process.argv[o + 1]) : DEFAULT_OUT;
  const r = buildSnapshot();
  const bad = checkSnapshot(r.html);
  if (bad.length) { console.error('Snapshot refused:\n- ' + bad.join('\n- ')); process.exit(1); }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, r.html);
  console.log(`${out}\n${(r.bytes / 1024).toFixed(0)} KB, built ${r.generated}\ncapabilities: ${JSON.stringify(CAPABILITIES)}`);
}
