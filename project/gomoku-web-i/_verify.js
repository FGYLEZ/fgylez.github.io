const fs = require('fs');
const html = fs.readFileSync('C:/Users/OwnLocal/WorkBuddy/2026-11-22-17-39-10/index.html', 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]);

function classList(){
  const set = new Set();
  return {
    add:(...c)=>c.forEach(x=>set.add(x)),
    remove:(...c)=>c.forEach(x=>set.delete(x)),
    contains:c=>set.has(c),
    toggle:(c,f)=>{ if(f===undefined) f=!set.has(c); f?set.add(c):set.delete(c); return f; }
  };
}
function mkEl(id){
  const e = {
    id, dataset:{}, textContent:'', innerHTML:'', title:'', className:'',
    style:{}, classList:classList(), children:[], handlers:{},
    setAttribute(){}, getAttribute(){ return null; }, focus(){}, contains(x){ return this.children.includes(x) || x===this; },
    addEventListener(t,f){ (this.handlers[t] = this.handlers[t] || []).push(f); },
    querySelectorAll(sel){ return sel === 'button' ? this.children.slice() : []; },
    click(target){ (this.handlers.click||[]).forEach(f=>f({target:target||this, preventDefault(){}})); }
  };
  e.closest = function(sel){ return sel === 'button' && e.dataset.value !== undefined ? e : null; };
  return e;
}
const els = {};
function E(id){ return els[id] || (els[id] = mkEl(id)); }
const segChildren = {
  segMode:['pvp','pve'], segVariant:['normal','insane'],
  segDiff:['easy','medium','hard','hell','insane'],
  segColor:['1','2'], segFirst:['1','2'], segSize:['10','12','15']
};
Object.keys(segChildren).forEach(id=>{
  const box = E(id);
  box.children = segChildren[id].map(v=>{ const b=mkEl(id+'_'+v); b.dataset.value=v; return b; });
});
const ctx = new Proxy({}, { get(t,k){
  if(k==='createLinearGradient'||k==='createRadialGradient') return ()=>({addColorStop(){}});
  if(k==='canvas') return E('board');
  return ()=>{};
}, set(){ return true; }});
E('board').getContext = ()=>ctx;
E('board').getBoundingClientRect = ()=>({width:500,height:500,left:0,top:0});

const storage = {};
global.localStorage = { getItem:k=>k in storage?storage[k]:null, setItem:(k,v)=>storage[k]=String(v), removeItem:k=>delete storage[k] };
global.document = {
  documentElement:{classList:classList()}, body:{style:{}},
  getElementById:E,
  addEventListener(){}, activeElement:null
};
global.window = {devicePixelRatio:1, addEventListener(){}};
global.performance = {now:()=>Date.now()};
global.Worker = undefined;
global.Blob = function(){};
global.URL = {createObjectURL(){ return 'blob:x'; }, revokeObjectURL(){}};
global.setTimeout = ()=>0;
global.clearTimeout = ()=>{};
global.setInterval = ()=>0;

let api;
const exportLine = 'global.__api={state,el,scoresGetter:()=>scores,rawScoreDelta,winScoreFor,endGame,syncSettingsFields,setVariant,initGame,cs:()=>document.documentElement.classList.contains("crazy-theme")};';
const body = scripts[1].replace(/\}\)\(\);\s*$/, exportLine + '\n})();');
if(body === scripts[1]) throw new Error('IIFE tail not found');
eval(body);
api = global.__api;
const {state, el} = api;
const seg = id => el[id] || E(id);
const btn = (id,v) => E(id).children.find(b=>b.dataset.value===v);
const active = id => E(id).children.filter(b=>b.classList.contains('active')).map(b=>b.dataset.value);
let pass=0, fail=0;
function t(name, fn){ try{ fn(); pass++; console.log('PASS '+name); }catch(e){ fail++; console.log('FAIL '+name+' :: '+e.message); } }
function ok(v,msg){ if(!v) throw new Error(msg||'assertion failed'); }

t('初始：规则模式可见、难度行隐藏、难度含变态项', ()=>{
  ok(!E('fieldVariant').classList.contains('hidden'), 'fieldVariant should show in pvp');
  ok(E('fieldDiff').classList.contains('hidden'), 'fieldDiff should hide in pvp');
  ok(E('segDiff').children.length===5, 'diff row should have 5 options');
  ok(!!btn('segDiff','insane'), 'insane option missing');
});

t('切到人机：规则模式隐藏、难度行显示', ()=>{
  E('segMode').click(btn('segMode','pve'));
  ok(E('fieldVariant').classList.contains('hidden'), 'variant field should hide in pve');
  ok(!E('fieldDiff').classList.contains('hidden'), 'diff field should show in pve');
  ok(state.mode==='pve','mode not switched');
});

t('人机难度行点击变态：先弹免责声明，未直接生效', ()=>{
  E('segDiff').click(btn('segDiff','insane'));
  ok(E('crazyOverlay').classList.contains('open'), 'crazy dialog should open');
  ok(state.variant!=='insane', 'variant changed before confirm');
});

t('确认变态：变态生效、难度行变态高亮、主题深红', ()=>{
  el.crazyContinue.handlers.click[0]({target:el.crazyContinue,preventDefault(){}});
  ok(state.variant==='insane','variant not insane');
  ok(state.forbidden===true,'forbidden not forced');
  ok(active('segDiff').join()==='insane','insane not active: '+active('segDiff'));
  ok(api.cs(),'crazy theme missing');
});

t('变态切回普通难度：退出变态、恢复禁手偏好与主题', ()=>{
  state.forbidden = true; // 模拟进入变态前用户开了禁手
  E('segDiff').click(btn('segDiff','easy'));
  ok(state.variant==='normal','variant not restored');
  ok(state.difficulty==='easy','difficulty not easy');
  ok(!api.cs(),'crazy theme not removed');
  ok(active('segDiff').join()==='easy','easy not active');
});

t('切回人人：规则模式重新可见', ()=>{
  E('segMode').click(btn('segMode','pvp'));
  ok(!E('fieldVariant').classList.contains('hidden'),'variant field should show in pvp');
  ok(E('fieldDiff').classList.contains('hidden'),'diff field should hide in pvp');
});

t('计分：普通胜 +10 / 平 +5', ()=>{
  state.mode='pvp'; state.variant='normal'; state.difficulty='medium';
  ok(api.rawScoreDelta(1,1)===10,'normal win');
  ok(api.rawScoreDelta(1,0)===5,'normal draw');
});

t('计分：地狱胜 +30 / 玩家负 -5 / 平局 +0', ()=>{
  state.difficulty='hell'; state.variant='normal'; state.mode='pve'; state.humanColor=1;
  ok(api.winScoreFor(1)===30,'hell player win should be 30');
  ok(api.winScoreFor(2)===30,'hell AI win should be 30');
  ok(api.rawScoreDelta(1,1)===30,'hell winner delta');
  ok(api.rawScoreDelta(1,2)===-5,'hell loser delta');
  ok(api.rawScoreDelta(2,1)===0,'hell AI loser no penalty');
  ok(api.rawScoreDelta(1,0)===0,'hell draw no points');
});

t('计分：变态胜 +60 / 普通负 0 / 超时负 -5', ()=>{
  state.variant='insane'; state.timeoutLoser=0;
  ok(api.rawScoreDelta(1,1)===60,'crazy win should be 60');
  ok(api.rawScoreDelta(1,2)===0,'crazy normal loss no penalty');
  state.timeoutLoser=1;
  ok(api.rawScoreDelta(1,2)===-5,'crazy timeout loss');
  state.timeoutLoser=0;
  ok(api.rawScoreDelta(2,2)===60,'crazy winner other side');
});

t('结算落账：地狱胜实际入账 30，变态胜实际入账 60', ()=>{
  const s = api.scoresGetter();
  Object.keys(s).forEach(k=>s[k]=0);
  state.mode='pvp'; state.variant='normal'; state.difficulty='hell'; state.settled=false; state.scoreSnapshot=null;
  api.endGame(1, [[0,0],[0,1],[0,2],[0,3],[0,4]]);
  ok(s.blackPoints===30,'hell settled '+s.blackPoints);
  Object.keys(s).forEach(k=>s[k]=0);
  state.variant='insane'; state.settled=false; state.scoreSnapshot=null;
  api.endGame(2, [[1,0],[1,1],[1,2],[1,3],[1,4]]);
  ok(s.whitePoints===60,'crazy settled '+s.whitePoints);
});

console.log('\n'+pass+' passed, '+fail+' failed');
process.exitCode = fail ? 1 : 0;
