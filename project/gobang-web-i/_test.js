const fs = require('fs');
const vm = require('vm');

let html = fs.readFileSync('index.html','utf8');
let script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
script = script.replace(
  '  renderScores();\n  initGame();\n})();',
  '  global.__api = {state:state, placeStone:placeStone, initGame:initGame, undo:undo, isForbidden:isForbidden, checkWin:checkWin, chooseAiMove:chooseAiMove, scores:scores, getN:function(){return N;}};\n})();'
);

const gradient = { addColorStop(){} };
const ctx = new Proxy({}, {
  get(t,k){
    if(k==='createLinearGradient'||k==='createRadialGradient') return ()=>gradient;
    if(k in t) return t[k];
    return ()=>{};
  },
  set(t,k,v){ t[k]=v; return true; }
});
function stub(){
  return {
    classList:{add(){},remove(){},toggle(){}},
    addEventListener(){}, querySelectorAll(){return [];},
    getBoundingClientRect(){return {width:500,left:0,top:0};},
    getContext(){return ctx;}, dataset:{}, style:{}, textContent:'', checked:false,
    contains(){return false;}, closest(){return null;}
  };
}
const elements = {};
const document = {
  getElementById(id){ return elements[id] || (elements[id]=stub()); },
  addEventListener(){}, querySelectorAll(){return [];}
};
const sandbox = {
  document, console,
  window:{ devicePixelRatio:1, addEventListener(){} },
  localStorage:{ getItem(){return null;}, setItem(){} },
  performance:{ now(){return Date.now();} },
  setInterval(){return 0;}, setTimeout(){return 0;}, clearTimeout(){},
  Math, Date, JSON, Array, Object, Infinity, parseInt, isNaN
};
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(script, sandbox);

const api = sandbox.__api;
const S = api.state;
let pass = 0, fail = 0;
function ok(name, cond, extra){
  if(cond){ pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra?' -> '+extra:'')); }
}
function reset(size, forbidden, mode){
  S.boardSize = size; S.forbidden = !!forbidden; S.mode = mode || 'pvp';
  S.humanColor = 1; S.firstPlayer = 1;
  api.initGame();
}

// 1) 五连获胜
reset(15,false);
for(let c=3;c<=7;c++){ S.currentPlayer=1; api.placeStone(7,c); }
ok('五连判胜', S.gameOver && S.winner===1, 'winner='+S.winner+' over='+S.gameOver);
ok('获胜连线为5子', S.winLine && S.winLine.length===5, S.winLine && S.winLine.length);

// 2) 禁手 - 长连
reset(15,true);
S.currentPlayer=1;
for(let c=3;c<=7;c++){ S.currentPlayer=1; api.placeStone(7,c); }
S.gameOver=false; S.winner=0; S.winLine=null;
let f = api.isForbidden(7,8);
ok('长连禁手识别', f==='长连禁手', String(f));

// 3) 100步平局（10x10，按 (r+2c)%4 配色，同色最长连=2）
reset(10,false);
for(let r=0;r<10;r++){
  for(let c=0;c<10;c++){
    const want = ((r + 2*c) % 4 < 2) ? 1 : 2;
    S.currentPlayer = want;
    api.placeStone(r,c);
  }
}
ok('第100手自动平局', S.gameOver && S.winner===0 && S.moveCount===100,
   'over='+S.gameOver+' winner='+S.winner+' moves='+S.moveCount);

// 4) 悔棋（人人：回退1步）
reset(15,false);
S.currentPlayer=1; api.placeStone(7,7);
S.currentPlayer=2; api.placeStone(7,8);
api.undo();
ok('悔棋回退一手', S.moveCount===1 && S.board[7][8]===0 && S.currentPlayer===2,
   'moves='+S.moveCount+' cell='+S.board[7][8]+' next='+S.currentPlayer);

// 5) AI 会封堵对手的成五点
reset(15,false,'pve');
S.humanColor=2; S.difficulty='medium';
for(let c=3;c<=6;c++){ S.board[7][c]=2; }
S.currentPlayer=1;
let mv = api.chooseAiMove();
ok('AI 封堵对手活四', mv && ((mv.r===7&&mv.c===2)||(mv.r===7&&mv.c===7)),
   mv?('r'+mv.r+'c'+mv.c):'null');

// 6) AI 优先自己成五
reset(15,false,'pve');
S.humanColor=2; S.difficulty='hard';
for(let c=3;c<=6;c++){ S.board[9][c]=1; }
S.currentPlayer=1;
mv = api.chooseAiMove();
ok('AI 自己成五', mv && ((mv.r===9&&mv.c===2)||(mv.r===9&&mv.c===7)),
   mv?('r'+mv.r+'c'+mv.c):'null');

console.log('\n结果: '+pass+' 通过, '+fail+' 失败');
process.exit(fail?1:0);
