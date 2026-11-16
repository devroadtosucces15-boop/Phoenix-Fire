// Visual roadmap: one renderer for two places. No dependencies, no secrets.
//   buildRoadmapData()                    the roadmap as plain data (from LIBRARY/roadmap.json and the usage snapshot), redacted
//   renderRoadmapPage({ data, mode })     one self-contained HTML page (inline CSS and JS)
//     mode 'live'      served by tools/brain/serve.mjs at /roadmap: refetches /api/roadmap-data when a library file changes
//     mode 'snapshot'  built by tools/brain/roadmap-page.mjs for the private Artifact: data embedded, says its build time
// The page shows the roadmap three ways (timeline, board, dependency graph) and a drawer per step. Deep links: #PF-018, #phase-<slug>, #timeline, #board, #graph.
import { execFileSync } from 'node:child_process';
import { readRoadmap, roadmapMetrics } from '../library/sync.mjs';
import { readUsage, readPolicy, evaluate } from './usage.mjs';
import { redact, ROOT } from './lib.mjs';

export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// GitHub web base for PR and commit links, taken from the git remote with any credential removed. Empty when there is none.
function repoBase() {
  try {
    const u = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const m = u.match(/github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/);
    return m ? `https://github.com/${m[1]}` : '';
  } catch { return ''; }
}

// Library and planning pages mentioned in an item's text, found by path shape. Shown as "pages it touched".
const PAGE_RE = /`((?:LIBRARY|PLANNING|tools|tests|bot|next|web|phoenix)\/[\w./-]+?\.(?:md|mjs|js|json|html))`/g;
export const pagesOf = (i) => [...new Set([i.notes, i.outcome, i.behavior, ...(i.doneLog || []).map((l) => l.what)].filter(Boolean).flatMap((t) => [...String(t).matchAll(PAGE_RE)].map((m) => m[1])))].slice(0, 12);

export function buildRoadmapData({ now = new Date() } = {}) {
  const rm = readRoadmap();
  const metrics = roadmapMetrics(rm.items);
  const done = new Set(rm.items.filter((i) => i.status === 'DONE').map((i) => i.id));
  const items = rm.items.map((i) => ({
    id: i.id, title: i.title, phase: i.phase, status: i.status, size: i.size, effort: i.effort, importance: i.importance, estMinutes: i.estMinutes, model: i.model,
    dependsOn: i.dependsOn, blockedBy: i.dependsOn.filter((d) => !done.has(d)), fileLane: i.fileLane, area: i.area, percent: i.percent, lowHanging: !!i.lowHanging, verify: !!i.verify,
    notes: i.notes, outcome: i.outcome || '', behavior: i.behavior || '', doneLog: i.doneLog || [], pages: pagesOf(i),
  }));
  const u = readUsage();
  const usage = u.latest ? { fiveHour: u.latest.fiveHour, weekly: u.latest.weekly, at: u.latest.timestamp, ...evaluate(u.latest, readPolicy(), now.getTime()) } : null;
  const data = { generated: now.toISOString(), updated: rm.updated, repo: repoBase(), project: metrics.project, phases: metrics.phases, next: items.find((i) => i.status === 'NEXT')?.id || null, items, usage };
  return JSON.parse(redact(JSON.stringify(data)));
}

const CSS = String.raw`
:root{--bg:#0a0705;--panel:#14100c;--panel2:#1b1510;--line:#2c231b;--txt:#efe8df;--mute:#a0978b;--acc:#e8651a;--onacc:#1a0d04;--gold:#efcf7a;--ok:#4be08a;--bad:#ff7d72;--steel:#8c97ad;--shadow:rgba(0,0,0,.55);
--display:'Barlow Condensed','Arial Narrow',Impact,sans-serif;--ui:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;--mono:ui-monospace,'SF Mono',Consolas,'Liberation Mono',monospace;color-scheme:dark}
@media (prefers-color-scheme:light){:root:not([data-theme="dark"]){--bg:#faf6f1;--panel:#ffffff;--panel2:#f2eadf;--line:#e1d4c4;--txt:#1c130c;--mute:#675c50;--acc:#c24f0c;--onacc:#ffffff;--gold:#8a6500;--ok:#13703c;--bad:#b3261e;--steel:#4f5b75;--shadow:rgba(60,35,10,.28);color-scheme:light}}
:root[data-theme="light"]{--bg:#faf6f1;--panel:#ffffff;--panel2:#f2eadf;--line:#e1d4c4;--txt:#1c130c;--mute:#675c50;--acc:#c24f0c;--onacc:#ffffff;--gold:#8a6500;--ok:#13703c;--bad:#b3261e;--steel:#4f5b75;--shadow:rgba(60,35,10,.28);color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--txt);font:14px/1.5 var(--ui)}
.wrap{max-width:1360px;margin:0 auto;padding-block:20px 80px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
button{font:inherit;color:inherit;cursor:pointer}
:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
header.top{display:flex;gap:14px;align-items:center;flex-wrap:wrap}
header.top img{width:52px;height:52px;object-fit:contain}
h1{font:700 32px/1 var(--display);letter-spacing:.05em;text-transform:uppercase;margin:0;text-wrap:balance}h1 em{font-style:normal;color:var(--acc)}
.lede{color:var(--mute);margin:4px 0 0}
.stamp{margin-left:auto;font-size:12px;color:var(--mute);display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.stamp i{width:8px;height:8px;border-radius:50%;background:var(--mute);display:inline-block}.stamp.on i{background:var(--ok)}
.btn{font:600 12.5px var(--ui);padding:6px 12px;border-radius:8px;border:1px solid var(--line);background:var(--panel);color:var(--txt)}
.btn:hover{border-color:var(--acc)}
.sum{display:grid;gap:14px;grid-template-columns:minmax(0,1.1fr) minmax(0,1.9fr);margin-top:18px}
@media(max-width:860px){.sum{grid-template-columns:minmax(0,1fr)}}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px;min-width:0}
.big{font:700 64px/1 var(--display);color:var(--acc);font-variant-numeric:tabular-nums}.big small{font-size:26px;color:var(--mute)}
.lab{font:600 11px var(--ui);letter-spacing:.1em;text-transform:uppercase;color:var(--mute)}
.meter{height:8px;background:var(--panel2);border:1px solid var(--line);border-radius:99px;overflow:hidden}.meter span{display:block;height:100%;background:var(--acc)}
.meter.ok span{background:var(--ok)}
.facts{display:flex;gap:8px 18px;flex-wrap:wrap;margin-top:10px;color:var(--mute);font-size:13px}.facts b{color:var(--txt);font-weight:600}
.phases{display:grid;gap:8px}
.phrow{display:grid;grid-template-columns:minmax(120px,190px) minmax(0,1fr) 112px;gap:10px;align-items:center;width:100%;text-align:left;background:none;border:1px solid transparent;border-radius:8px;padding:5px 6px}
.phrow:hover,.phrow[aria-pressed=true]{border-color:var(--acc);background:var(--panel2)}
.phrow .n{font-weight:600;overflow-wrap:anywhere}.phrow .c{color:var(--mute);font-size:12px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
@media(max-width:560px){.phrow{grid-template-columns:minmax(0,1fr) auto}.phrow .meter{grid-column:1/-1;order:3}}
.cols{align-items:start;display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));margin-top:14px}
.cols .card h2{margin:0 0 8px}
h2{font:700 20px/1.1 var(--display);letter-spacing:.04em;text-transform:uppercase;margin:0}
.mini{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}
.mini button{width:100%;text-align:left;display:flex;gap:8px;align-items:baseline;background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:7px 10px}
.mini button:hover{border-color:var(--acc)}.mini .id{font:700 15px var(--display);color:var(--acc);flex:none}.mini .t{min-width:0;overflow-wrap:anywhere}
.save{border-color:var(--bad)}
.bar{position:sticky;top:env(safe-area-inset-top,0px);z-index:6;background:var(--bg);margin-top:16px;padding:10px 0;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:8px}
@media(max-width:700px){.bar{position:static}}
.r{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.tab{font:700 15px var(--display);letter-spacing:.06em;text-transform:uppercase;padding:7px 16px;border-radius:8px;border:1px solid var(--line);background:var(--panel)}
.tab[aria-selected=true],.chip[aria-pressed=true]{background:var(--acc);border-color:var(--acc);color:var(--onacc);font-weight:600}
.chip{font:500 12.5px var(--ui);padding:6px 11px;border-radius:99px;border:1px solid var(--line);background:var(--panel);white-space:nowrap}
.chip b{font-weight:500;opacity:.75;margin-left:5px}
select,input[type=search]{padding:7px 10px;background:var(--panel);border:1px solid var(--line);border-radius:8px;color:var(--txt);font:inherit;min-width:0}
input[type=search]{flex:1 1 200px}
.dot{width:9px;height:9px;border-radius:50%;display:inline-block;flex:none;background:var(--steel)}
.s-DONE{--sc:var(--ok)}.s-NEXT{--sc:var(--gold)}.s-OPEN{--sc:var(--steel)}.s-BLOCKED{--sc:var(--bad)}.s-PAUSED{--sc:var(--acc)}
.dot,.tag.st{background:var(--sc)}
.tag{font-size:11px;padding:2px 8px;border-radius:99px;border:1px solid var(--line);color:var(--mute);white-space:nowrap;display:inline-block}
.tag.st{color:#0a0705;border-color:var(--sc);font-weight:700;letter-spacing:.04em}
.view{margin-top:16px}
.lane{margin-bottom:14px}
.lanehd{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
.lanehd .meter{width:140px}.lanehd .c{color:var(--mute);font-size:12px}
.track{display:flex;flex-wrap:wrap;gap:8px;align-items:stretch;padding-left:14px;border-left:3px solid var(--line)}
.node{display:flex;flex-direction:column;gap:2px;text-align:left;width:min(100%,214px);background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--sc);border-radius:10px;padding:8px 10px;min-height:62px}
.node:hover,.node[aria-current=true]{border-color:var(--acc);border-left-color:var(--sc)}
.node .id{font:700 15px var(--display);color:var(--acc);display:flex;gap:6px;align-items:center}
.node .t{font-size:12.5px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.node .m{font-size:11px;color:var(--mute)}
.board{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));align-items:start}
.col{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:8px;min-width:0}
.col h3{font:700 16px var(--display);letter-spacing:.06em;text-transform:uppercase;margin:0 0 2px;display:flex;gap:8px;align-items:center}
.col h3 span{color:var(--mute);font-weight:500}
.col .node{width:100%}
.gscroll{overflow:auto;border:1px solid var(--line);border-radius:12px;background:var(--panel);max-width:100%}
.gscroll svg{display:block}
.gn{cursor:pointer}.gn rect{fill:var(--panel2);stroke:var(--line);stroke-width:1.2}.gn:hover rect,.gn.sel rect{stroke:var(--acc);stroke-width:2}
.gn .bar4{fill:var(--sc)}.gn text{fill:var(--txt);font:12px var(--ui)}.gn .gid{font:700 15px var(--display);fill:var(--acc)}.gn .gt{fill:var(--mute);font-size:11px}
.gn.crit rect{stroke:var(--gold);stroke-width:2}
.ge{fill:none;stroke:var(--line);stroke-width:1.4}.ge.crit{stroke:var(--gold);stroke-width:2.4}.ge.hi{stroke:var(--acc);stroke-width:2.4}
.legend{display:flex;gap:14px;flex-wrap:wrap;color:var(--mute);font-size:12px;margin:8px 2px}.legend i{display:inline-block;width:22px;height:0;border-top:3px solid var(--gold);vertical-align:middle;margin-right:6px}
.empty{color:var(--mute);padding:24px;text-align:center;border:1px dashed var(--line);border-radius:12px}
.scrim{position:fixed;inset:0;background:var(--shadow);z-index:20}
aside.drawer{position:fixed;z-index:21;top:0;right:0;bottom:0;width:min(560px,100%);background:var(--panel);border-left:1px solid var(--line);overflow-y:auto;padding:18px max(16px,env(safe-area-inset-right,0px)) calc(28px + env(safe-area-inset-bottom,0px)) 18px;display:flex;flex-direction:column;gap:14px;box-shadow:-12px 0 40px var(--shadow)}
@media(max-width:700px){aside.drawer{top:auto;height:88%;width:100%;border-left:0;border-top:1px solid var(--line);border-radius:16px 16px 0 0;padding-left:max(16px,env(safe-area-inset-left,0px))}}
.dh{display:flex;gap:10px;align-items:flex-start}.dh .x{margin-left:auto;flex:none}
.dh h2{font-size:24px;text-transform:none;letter-spacing:.01em;line-height:1.15;overflow-wrap:anywhere;text-wrap:balance}
.dh .id{font:700 26px var(--display);color:var(--acc);display:block;margin-bottom:2px;letter-spacing:.04em}
.sec h4{font:600 11px var(--ui);letter-spacing:.1em;text-transform:uppercase;color:var(--mute);margin:0 0 4px}
.sec p{margin:0;overflow-wrap:anywhere}
.sec.lead p{font-size:15.5px}
.kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}
.kv div{background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:6px 10px;min-width:0}
.kv span{display:block;font-size:11px;color:var(--mute)}.kv b{font-weight:600;overflow-wrap:anywhere}
.links{display:flex;gap:6px;flex-wrap:wrap}.links .chip{font-family:var(--display);font-weight:700;font-size:14px;letter-spacing:.04em}
.log{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
.log li{border-left:3px solid var(--ok);padding:2px 0 2px 10px}.log .d{color:var(--mute);font-size:12px}.log a{color:var(--acc)}
code{font:12px var(--mono);background:var(--panel2);border:1px solid var(--line);border-radius:5px;padding:1px 5px;overflow-wrap:anywhere}
.pages{display:flex;gap:6px;flex-wrap:wrap}
@media (prefers-reduced-motion:no-preference){aside.drawer{animation:slide .18s ease-out}@keyframes slide{from{transform:translateX(24px);opacity:.4}}}
`;

const JS = String.raw`
(function(){
var D=null,view='timeline',fStatus='',fPhase='',fModel='',q='',sel=null,live=MODE==='live';
var ST=['NEXT','OPEN','BLOCKED','PAUSED','DONE'];
var $=function(s,r){return (r||document).querySelector(s)};
var E=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
var slug=function(s){return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')};
var by={},depth={},unl={};
function index(){by={};depth={};unl={};D.items.forEach(function(i){by[i.id]=i;unl[i.id]=[]});
 D.items.forEach(function(i){i.dependsOn.forEach(function(d){if(unl[d])unl[d].push(i.id)})});
 function dp(i,seen){if(depth[i.id]!=null)return depth[i.id];if(seen[i.id])return 0;seen[i.id]=1;var m=-1;i.dependsOn.forEach(function(d){if(by[d])m=Math.max(m,dp(by[d],seen))});return depth[i.id]=m+1}
 D.items.forEach(function(i){dp(i,{})})}
function match(i){if(fStatus&&i.status!==fStatus)return false;if(fPhase&&slug(i.phase)!==fPhase)return false;if(fModel&&i.model!==fModel)return false;
 if(q){var h=(i.id+' '+i.title+' '+i.outcome+' '+i.behavior+' '+i.notes+' '+i.phase).toLowerCase();if(h.indexOf(q.toLowerCase())<0)return false}return true}
function lastDone(i){var l=i.doneLog[i.doneLog.length-1];return l?l.date:'9999'}
// Critical path: the chain of unfinished steps with the most estimated minutes. Gold in the graph.
function critical(){var best={},nxt={},open=D.items.filter(function(i){return i.status!=='DONE'});
 function f(i){if(best[i.id]!=null)return best[i.id];var m=0,n=null;(unl[i.id]||[]).forEach(function(u){var x=by[u];if(x.status==='DONE')return;var v=f(x);if(v>m){m=v;n=u}});nxt[i.id]=n;return best[i.id]=i.estMinutes+m}
 var start=null,sv=-1;open.forEach(function(i){if(i.dependsOn.every(function(d){return !by[d]||by[d].status==='DONE'})||true){var v=f(i);if(v>sv){sv=v;start=i}}});
 var ids={},edges={},c=start&&start.id;while(c){ids[c]=1;var n=nxt[c];if(n)edges[c+'>'+n]=1;c=n}
 return{ids:ids,edges:edges,minutes:sv>0?sv:0,start:start&&start.id}}
function pctClass(i){return i.status==='DONE'?'ok':''}
function nodeBtn(i){return '<button class="node s-'+i.status+'" data-id="'+E(i.id)+'"'+(sel===i.id?' aria-current="true"':'')+'><span class="id"><i class="dot"></i>'+E(i.id)+'<span class="tag" style="margin-left:auto">'+E(i.size)+'</span></span><span class="t">'+E(i.title.replace(/\x60/g,''))+'</span><span class="m">'+E(i.status)+(i.status==='DONE'?' '+E(lastDone(i)):i.estMinutes?' · about '+i.estMinutes+' min':'')+'</span></button>'}
function summary(){
 var c={};ST.forEach(function(s){c[s]=0});D.items.forEach(function(i){c[i.status]++});
 var nx=D.items.filter(function(i){return i.status==='NEXT'}),wait=D.items.filter(function(i){return i.status==='BLOCKED'||i.status==='PAUSED'});
 var left=D.items.filter(function(i){return i.status!=='DONE'}).reduce(function(a,i){return a+(i.estMinutes||0)*(100-i.percent)/100},0);
 var u=D.usage,us='';
 if(u){us='<div class="card'+(u.saveMode?' save':'')+'"><h2>Usage</h2><p style="margin:6px 0 4px">5-hour window <b>'+(u.fiveHour==null?'?':u.fiveHour+'%')+'</b> · week <b>'+(u.weekly==null?'?':u.weekly+'%')+'</b></p><div class="meter"><span style="width:'+(u.fiveHour||0)+'%"></span></div><p class="lab" style="margin:8px 0 0">'+(u.saveMode?'Save mode: only low-hanging items. ':'')+'Snapshot '+E(String(u.at||'').slice(0,16).replace('T',' '))+' UTC'+(u.stale?' (stale)':'')+'</p></div>'}
 var list=function(xs,empty){return xs.length?'<ul class="mini">'+xs.map(function(i){return '<li><button data-id="'+E(i.id)+'"><span class="id">'+E(i.id)+'</span><span class="t">'+E(i.title.replace(/\x60/g,''))+'</span></button></li>'}).join('')+'</ul>':'<p class="lab" style="margin:0">'+empty+'</p>'};
 return '<section class="sum"><div class="card"><div class="lab">Project</div><div class="big">'+D.project+'<small>%</small></div><div class="meter" role="progressbar" aria-valuenow="'+D.project+'" aria-valuemin="0" aria-valuemax="100" aria-label="Project progress"><span style="width:'+D.project+'%"></span></div>'
 +'<div class="facts"><span><b>'+c.DONE+'</b> of '+D.items.length+' done</span><span><b>'+c.OPEN+'</b> open</span><span><b>'+c.BLOCKED+'</b> blocked</span><span>about <b>'+Math.round(left/60)+' h</b> of work left</span></div></div>'
 +'<div class="card"><div class="lab" style="margin-bottom:6px">Phases (click to filter)</div><div class="phases">'+D.phases.map(function(p){return '<button class="phrow" data-phase="'+slug(p.phase)+'" aria-pressed="'+(fPhase===slug(p.phase))+'"><span class="n">'+E(p.phase)+'</span><span class="meter'+(p.percent===100?' ok':'')+'"><span style="width:'+p.percent+'%"></span></span><span class="c">'+p.done+'/'+p.items+' · '+p.percent+'%</span></button>'}).join('')+'</div></div></section>'
 +'<section class="cols"><div class="card"><h2>Next up</h2>'+list(nx,'Nothing is marked NEXT.')+'</div><div class="card"><h2>Waiting on the owner</h2>'+list(wait,'Nothing is waiting.')+'</div>'+us+'</section>'}
function bar(){
 var c={};ST.forEach(function(s){c[s]=0});D.items.forEach(function(i){c[i.status]++});
 var models=[];D.items.forEach(function(i){if(models.indexOf(i.model)<0)models.push(i.model)});
 return '<div class="bar"><div class="r" role="tablist" aria-label="Roadmap view">'+['timeline','board','graph'].map(function(v){return '<button class="tab" role="tab" data-view="'+v+'" aria-selected="'+(view===v)+'">'+v+'</button>'}).join('')
 +'<span style="flex:1"></span><button class="btn" id="th" aria-label="Switch light or dark">Theme</button></div>'
 +'<div class="r"><span class="lab">Status</span>'+ST.map(function(s){return '<button class="chip" data-st="'+s+'" aria-pressed="'+(fStatus===s)+'">'+s.toLowerCase()+'<b>'+c[s]+'</b></button>'}).join('')+'</div>'
 +'<div class="r"><input type="search" id="q" placeholder="Search steps, outcomes, notes" aria-label="Search steps" value="'+E(q)+'"><label class="lab" for="fm">Model</label><select id="fm"><option value="">all</option>'+models.map(function(m){return '<option'+(fModel===m?' selected':'')+'>'+E(m)+'</option>'}).join('')+'</select>'
 +(fStatus||fPhase||fModel||q?'<button class="btn" id="clr">Clear filters</button>':'')+'</div></div>'}
function timeline(){
 var phases=[];D.items.forEach(function(i){if(phases.indexOf(i.phase)<0)phases.push(i.phase)});
 var out=phases.map(function(p){var xs=D.items.filter(function(i){return i.phase===p&&match(i)});if(!xs.length)return '';
  xs.sort(function(a,b){return lastDone(a).localeCompare(lastDone(b))||depth[a.id]-depth[b.id]||a.id.localeCompare(b.id)});
  var m=D.phases.filter(function(x){return x.phase===p})[0]||{percent:0,done:0,items:0};
  return '<section class="lane" id="phase-'+slug(p)+'"><div class="lanehd"><h2>'+E(p)+'</h2><span class="meter'+(m.percent===100?' ok':'')+'"><span style="width:'+m.percent+'%"></span></span><span class="c">'+m.done+' of '+m.items+' done · '+m.percent+'%</span></div><div class="track">'+xs.map(nodeBtn).join('')+'</div></section>'}).join('');
 return out||'<div class="empty">No step matches these filters.</div>'}
function board(){
 var cols=ST.map(function(s){var xs=D.items.filter(function(i){return i.status===s&&match(i)});if(!xs.length&&(fStatus||fPhase||fModel||q))return '';
  xs.sort(function(a,b){return s==='DONE'?lastDone(b).localeCompare(lastDone(a)):b.importance-a.importance||depth[a.id]-depth[b.id]});
  return '<div class="col s-'+s+'"><h3><i class="dot"></i>'+s.toLowerCase()+' <span>'+xs.length+'</span></h3>'+(xs.map(nodeBtn).join('')||'<p class="lab" style="margin:0">Empty</p>')+'</div>'}).join('');
 return cols?'<div class="board">'+cols+'</div>':'<div class="empty">No step matches these filters.</div>'}
function graph(){
 var items=D.items.filter(match);if(!items.length)return '<div class="empty">No step matches these filters.</div>';
 var W=190,H=52,GX=64,GY=14,cr=critical(),col={},pos={},maxd=0;
 items.forEach(function(i){var d=depth[i.id];col[d]=(col[d]||0)+1;maxd=Math.max(maxd,d)});var row={};
 items.forEach(function(i){var d=depth[i.id];row[d]=row[d]||0;pos[i.id]={x:12+d*(W+GX),y:12+row[d]*(H+GY)};row[d]++});
 var rows=0;for(var k in col)rows=Math.max(rows,col[k]);var w=24+(maxd+1)*(W+GX)-GX,h=24+rows*(H+GY)-GY;
 var edges='',nodes='';
 items.forEach(function(i){i.dependsOn.forEach(function(d){if(!pos[d])return;var a=pos[d],b=pos[i.id],x1=a.x+W,y1=a.y+H/2,x2=b.x,y2=b.y+H/2,mx=(x1+x2)/2;var key=d+'>'+i.id,cls='ge'+(cr.edges[key]?' crit':'')+(sel&&(sel===i.id||sel===d)?' hi':'');
   edges+='<path class="'+cls+'" d="M'+x1+' '+y1+' C'+mx+' '+y1+' '+mx+' '+y2+' '+x2+' '+y2+'"/>'})});
 items.forEach(function(i){var p=pos[i.id];var t=i.title.replace(/\x60/g,'');if(t.length>30)t=t.slice(0,29)+'…';
  nodes+='<g class="gn s-'+i.status+(cr.ids[i.id]?' crit':'')+(sel===i.id?' sel':'')+'" data-id="'+E(i.id)+'" tabindex="0" role="button" aria-label="'+E(i.id+' '+i.status+' '+i.title.replace(/\x60/g,''))+'" transform="translate('+p.x+' '+p.y+')"><rect width="'+W+'" height="'+H+'" rx="9"/><rect class="bar4" width="5" height="'+H+'" rx="2"/><text class="gid" x="14" y="21">'+E(i.id)+'</text><text class="gt" x="'+(W-10)+'" y="21" text-anchor="end">'+E(i.status.toLowerCase())+'</text><text class="gt" x="14" y="40">'+E(t)+'</text></g>'});
 return '<div class="gscroll"><svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" role="group" aria-label="Dependency graph, left to right">'+edges+nodes+'</svg></div><div class="legend"><span>Arrows run from a step to what it unlocks.</span><span><i></i>Critical path: the longest chain of unfinished work'+(cr.minutes?' (about '+Math.round(cr.minutes/60)+' h)':'')+'</span></div>'}
function link(ref){var r=E(ref);if(!D.repo)return r;return r.replace(/\bPR (\d+)\b/g,'<a href="'+D.repo+'/pull/$1" target="_blank" rel="noopener">PR $1</a>').replace(/\b([0-9a-f]{7,40})\b/g,function(m){return /\d/.test(m)&&/[a-f]/.test(m)?'<a href="'+D.repo+'/commit/'+m+'" target="_blank" rel="noopener">'+m+'</a>':m})}
function drawer(){var i=by[sel];if(!i)return '';
 var chips=function(ids){return ids.length?'<div class="links">'+ids.map(function(d){return '<button class="chip s-'+(by[d]?by[d].status:'OPEN')+'" data-id="'+E(d)+'">'+E(d)+'</button>'}).join('')+'</div>':'<p class="lab" style="margin:0">None</p>'};
 var kv=function(k,v){return '<div><span>'+k+'</span><b>'+E(v)+'</b></div>'};
 return '<div class="scrim" data-close="1"></div><aside class="drawer s-'+i.status+'" role="dialog" aria-modal="true" aria-label="'+E(i.id)+' details" id="dr"><div class="dh"><div><span class="id">'+E(i.id)+'</span><h2>'+E(i.title.replace(/\x60/g,''))+'</h2></div><button class="btn x" data-close="1" aria-label="Close details">Close</button></div>'
 +'<div class="r"><span class="tag st">'+E(i.status)+(i.verify?' (verify)':'')+'</span><span class="tag">'+E(i.phase)+'</span>'+(i.lowHanging?'<span class="tag">low-hanging</span>':'')+'</div>'
 +'<div class="meter'+pctClass(i)+'" role="progressbar" aria-valuenow="'+i.percent+'" aria-valuemin="0" aria-valuemax="100" aria-label="Step progress"><span style="width:'+i.percent+'%"></span></div>'
 +'<div class="sec lead"><h4>Outcome</h4><p>'+E(i.outcome||'Not written yet.')+'</p></div><div class="sec"><h4>Behavior</h4><p>'+E(i.behavior||'Not written yet.')+'</p></div>'
 +'<div class="kv">'+kv('Progress',i.percent+'%')+kv('Size',i.size)+kv('Effort',i.effort+' of 5')+kv('Importance',i.importance+' of 5')+kv('Estimate',i.estMinutes?i.estMinutes+' min':'none')+kv('Model',i.model)+'</div>'
 +'<div class="sec"><h4>Depends on'+(i.blockedBy.length?' (waiting on '+E(i.blockedBy.join(', '))+')':'')+'</h4>'+chips(i.dependsOn)+'</div><div class="sec"><h4>Unlocks</h4>'+chips(unl[i.id]||[])+'</div>'
 +'<div class="sec"><h4>Notes</h4><p>'+E(i.notes.replace(/\x60/g,'')||'None')+'</p></div><div class="sec"><h4>Files it works in</h4><p>'+E(i.fileLane.replace(/\x60/g,''))+'</p></div>'
 +'<div class="sec"><h4>Done log</h4>'+(i.doneLog.length?'<ul class="log">'+i.doneLog.map(function(l){return '<li><div class="d">'+E(l.date)+' · '+link(l.ref||'')+'</div>'+E(l.what)+'</li>'}).join('')+'</ul>':'<p class="lab" style="margin:0">Not done yet.</p>')+'</div>'
 +(i.pages.length?'<div class="sec"><h4>Pages it touched</h4><div class="pages">'+i.pages.map(function(p){return '<code>'+E(p)+'</code>'}).join('')+'</div></div>':'')+'</aside>'}
var back=null;
function render(){if(!D)return;index();var keep=document.activeElement&&document.activeElement.id;var qv=q;
 var body=view==='board'?board():view==='graph'?graph():timeline();
 $('#app').innerHTML=summary()+bar()+'<div class="view">'+body+'</div>'+drawer();
 var st=$('#stamp');st.className='stamp'+(live?' on':'');st.innerHTML=live?'<i></i>Live, refreshes when the files change · data '+E(D.updated):'Snapshot built '+E(D.generated.slice(0,16).replace('T',' '))+' UTC · changes only when a session republishes';
 if(keep==='q'){var el=$('#q');if(el){el.focus();el.setSelectionRange(qv.length,qv.length)}}
 if(sel){var dr=$('#dr');if(dr&&!back){back=document.activeElement;dr.setAttribute('tabindex','-1');dr.focus()}}}
function setHash(h){try{if(location.hash.slice(1)!==h)history.replaceState(null,'','#'+h)}catch(e){location.hash=h}}
function open(id){if(!by[id])return;sel=id;setHash(id);render()}
function close(){sel=null;var b=back;back=null;setHash(view);render();if(b&&b.focus&&document.contains(b))b.focus()}
function route(){var h=decodeURIComponent(location.hash.slice(1));
 if(/^PF-\d+$/.test(h)&&D&&by[h]){sel=h;return}
 if(/^phase-/.test(h)){var s=h.slice(6);if(D&&D.phases.some(function(p){return slug(p.phase)===s})){fPhase=s;sel=null;view='timeline';return}}
 if(h==='board'||h==='graph'||h==='timeline'){view=h;sel=null;return}}
function theme(){var r=document.documentElement,cur=r.getAttribute('data-theme');var dark=cur?cur==='dark':!(window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches);var n=dark?'light':'dark';r.setAttribute('data-theme',n);try{localStorage.setItem('pf-theme',n)}catch(e){}}
document.addEventListener('click',function(e){var t=e.target;var b;
 if(t.closest('[data-close]')){close();return}
 if((b=t.closest('[data-id]'))){open(b.dataset.id);return}
 if((b=t.closest('[data-view]'))){view=b.dataset.view;sel=null;setHash(view);render();return}
 if((b=t.closest('[data-st]'))){fStatus=fStatus===b.dataset.st?'':b.dataset.st;render();return}
 if((b=t.closest('[data-phase]'))){fPhase=fPhase===b.dataset.phase?'':b.dataset.phase;view='timeline';setHash(fPhase?'phase-'+fPhase:'timeline');render();if(fPhase){var l=document.getElementById('phase-'+fPhase);if(l&&l.scrollIntoView)l.scrollIntoView({block:'nearest'})}return}
 if(t.closest('#clr')){fStatus=fPhase=fModel=q='';render();return}
 if(t.closest('#th')){theme();return}});
document.addEventListener('input',function(e){if(e.target.id==='q'){q=e.target.value;render()}});
document.addEventListener('change',function(e){if(e.target.id==='fm'){fModel=e.target.value;render()}});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&sel){close();return}
 if((e.key==='Enter'||e.key===' ')&&e.target.classList&&e.target.classList.contains('gn')){e.preventDefault();open(e.target.dataset.id)}
 if(e.key==='Tab'&&sel){var dr=$('#dr');if(!dr)return;var f=[].slice.call(dr.querySelectorAll('button,a[href]'));if(!f.length)return;var a=f[0],z=f[f.length-1];if(e.shiftKey&&(document.activeElement===a||document.activeElement===dr)){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}}});
window.addEventListener('hashchange',function(){route();render()});
function load(d){D=d;index();route();render()}
try{var t=localStorage.getItem('pf-theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}
var el=document.getElementById('rm-data');
if(el){load(JSON.parse(el.textContent))}
if(live){var pull=function(){fetch('/api/roadmap-data',{cache:'no-store'}).then(function(r){return r.json()}).then(function(d){D=d;index();route();render()}).catch(function(){})};
 try{var es=new EventSource('/events');es.addEventListener('change',pull)}catch(e){}if(!el)pull()}
})();
`;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// JSON that cannot close its script tag or break on line separators.
const safeJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c').split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029');

export function renderRoadmapPage({ data, mode = 'snapshot', crest = '/crest.png' } = {}) {
  if (!data) throw new Error('renderRoadmapPage needs data');
  return `<title>Phoenix Roadmap</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Phoenix Fire roadmap: every phase and step, with outcome, behavior, status and dependencies.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;700&family=Inter:wght@400;500;600&display=swap">
<style>${CSS}</style>
<div class="wrap">
<header class="top"><img src="${esc(crest)}" alt="Phoenix Fire crest" width="52" height="52"><div><h1>Phoenix <em>Roadmap</em></h1><p class="lede">Rise. Burn. Repeat. Every phase and step, and what each one gives the club.</p></div><div class="stamp" id="stamp"></div></header>
<main id="app"></main>
</div>
<script>var MODE=${safeJson(mode)};</script>
<script id="rm-data" type="application/json">${safeJson(data)}</script>
<script>${JS}</script>
`;
}
