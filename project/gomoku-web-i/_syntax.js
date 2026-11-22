
(function(){
  'use strict';

  /* ================= 常量与状态 ================= */
  var DIRS = [[0,1],[1,0],[1,1],[1,-1]];
  var STORE_KEY = 'guyun_gomoku_scores_v1';
  var SETTINGS_OPEN_KEY = 'guyun_settings_menu_open_v1';

  var state = {
    boardSize: 15,
    mode: 'pvp',
    difficulty: 'medium',
    humanColor: 1,
    firstPlayer: 1,
    forbidden: false,
    board: [],
    history: [],
    currentPlayer: 1,
    moveCount: 0,
    gameOver: false,
    winner: 0,
    winLine: null,
    lastMove: null,
    clocks: {1:0, 2:0}
  };
  var N = state.boardSize;
  var geom = {size:0, pad:0, cell:0};
  var hover = null;
  var aiTimer = null;
  var lastTick = 0;

  var el = {};
  [   'board','statusText','status','moveNo','forbidBadge','btnUndo','btnRestart',
   'settingsPanel','settingsToggle','settingsBody',
   'chkForbidden','card1','card2','name1','name2','role1','role2','clock1','clock2',
   'scBlack','scWhite','scDraw','scTotal','scPveW','scPveL','scPveD',
   'fieldDiff','fieldColor'].forEach(function(id){ el[id] = document.getElementById(id); });

  var canvas = el.board;
  var ctx = canvas.getContext('2d');

  /* ================= 积分存储 ================= */
  function defaultScores(){
    return {blackWins:0, whiteWins:0, draws:0, total:0, pveW:0, pveL:0, pveD:0};
  }
  function loadScores(){
    try{
      var raw = localStorage.getItem(STORE_KEY);
      if(!raw) return defaultScores();
      var o = JSON.parse(raw), d = defaultScores();
      for(var k in d){ if(typeof o[k] === 'number') d[k] = o[k]; }
      return d;
    }catch(e){ return defaultScores(); }
  }
  function saveScores(){
    try{ localStorage.setItem(STORE_KEY, JSON.stringify(scores)); }catch(e){}
  }
  var scores = loadScores();

  function renderScores(){
    el.scBlack.textContent = scores.blackWins;
    el.scWhite.textContent = scores.whiteWins;
    el.scDraw.textContent  = scores.draws;
    el.scTotal.textContent = scores.total;
    el.scPveW.textContent  = scores.pveW;
    el.scPveL.textContent  = scores.pveL;
    el.scPveD.textContent  = scores.pveD;
  }

  /* ================= 设置菜单展开状态 ================= */
  // 首次访问（无存储记录）自动展开；之后沿用用户上次的选择
  function readSettingsOpen(){
    try{
      var v = localStorage.getItem(SETTINGS_OPEN_KEY);
      if(v === null || v === undefined || v === '') return true;
      return v !== '0';
    }catch(e){ return true; }
  }
  function applySettingsOpen(open, persist){
    el.settingsPanel.classList.toggle('collapsed', !open);
    el.settingsToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if(persist){
      try{ localStorage.setItem(SETTINGS_OPEN_KEY, open ? '1' : '0'); }catch(e){}
    }
  }

  /* ================= 工具函数 ================= */
  function aiColor(){ return state.humanColor === 1 ? 2 : 1; }
  function colorName(c){ return c === 1 ? '黑方' : '白方'; }
  function canHumanPlay(){
    return !state.gameOver && (state.mode === 'pvp' || state.currentPlayer === state.humanColor);
  }
  function fmtTime(ms){
    var s = Math.floor(ms/1000);
    var m = Math.floor(s/60);
    s = s % 60;
    return (m<10?'0':'')+m+':'+(s<10?'0':'')+s;
  }
  function setStatus(text, type){
    el.statusText.textContent = text;
    el.status.className = 'status' + (type ? ' ' + type : '');
  }

  /* ================= 棋盘绘制 ================= */
  function resizeCanvas(){
    var cssSize = canvas.getBoundingClientRect().width;
    if(!cssSize) return;
    var dpr = window.devicePixelRatio || 1;
    var px = Math.round(cssSize * dpr);
    if(canvas.width !== px || canvas.height !== px){
      canvas.width = px; canvas.height = px;
    }
    geom.size = cssSize;
    geom.pad = Math.max(16, cssSize * 0.065);
    geom.cell = (cssSize - 2*geom.pad) / (N - 1);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    drawBoard();
  }

  function drawBoard(){
    if(!geom.size) return;
    var s = geom.size, pad = geom.pad, cell = geom.cell;

    // 木质底色
    var g = ctx.createLinearGradient(0,0,s,s);
    g.addColorStop(0,'#f4dfb4'); g.addColorStop(0.45,'#e8c88d'); g.addColorStop(1,'#d3a460');
    ctx.fillStyle = g; ctx.fillRect(0,0,s,s);

    // 木纹
    ctx.save();
    ctx.globalAlpha = 0.07; ctx.strokeStyle = '#6b4318'; ctx.lineWidth = 1.2;
    for(var i=0;i<14;i++){
      var y = (i/13)*s;
      ctx.beginPath(); ctx.moveTo(0,y);
      for(var x=0;x<=s;x+=18){ ctx.lineTo(x, y + Math.sin(x/s*7 + i*1.3)*3.2); }
      ctx.stroke();
    }
    ctx.restore();

    // 网格
    ctx.strokeStyle = 'rgba(78,48,18,.78)';
    ctx.lineWidth = Math.max(0.9, s/560*1.05);
    ctx.beginPath();
    for(var k=0;k<N;k++){
      var p = pad + k*cell;
      ctx.moveTo(pad, p); ctx.lineTo(s-pad, p);
      ctx.moveTo(p, pad); ctx.lineTo(p, s-pad);
    }
    ctx.stroke();

    // 外框加粗
    ctx.lineWidth = Math.max(1.6, s/560*2);
    ctx.strokeRect(pad, pad, cell*(N-1), cell*(N-1));

    // 星位
    ctx.fillStyle = 'rgba(60,36,12,.85)';
    var stars = [];
    if(N === 15){ stars = [[3,3],[3,11],[7,7],[11,3],[11,11]]; }
    else if(N === 12){ stars = [[3,3],[3,8],[8,3],[8,8]]; }
    else if(N === 10){ stars = [[2,2],[2,7],[7,2],[7,7]]; }
    for(var t=0;t<stars.length;t++){
      ctx.beginPath();
      ctx.arc(pad+stars[t][1]*cell, pad+stars[t][0]*cell, Math.max(2.2, cell*0.09), 0, Math.PI*2);
      ctx.fill();
    }

    // 悬停预览
    if(hover && canHumanPlay() && state.board[hover.r][hover.c] === 0){
      var hx = pad+hover.c*cell, hy = pad+hover.r*cell;
      var bad = state.currentPlayer === 1 && state.forbidden && isForbidden(hover.r, hover.c);
      ctx.save();
      ctx.globalAlpha = 0.42;
      drawStone(hx, hy, state.currentPlayer, false, bad);
      ctx.restore();
    }

    // 棋子
    for(var r=0;r<N;r++){
      for(var c=0;c<N;c++){
        if(state.board[r][c] !== 0){
          var isLast = state.lastMove && state.lastMove.r===r && state.lastMove.c===c;
          drawStone(pad+c*cell, pad+r*cell, state.board[r][c], isLast, false);
        }
      }
    }

    // 获胜连线
    if(state.winLine && state.winLine.length){
      ctx.save();
      ctx.strokeStyle = 'rgba(15,108,189,.9)';
      ctx.lineWidth = Math.max(3, cell*0.14);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(15,108,189,.5)'; ctx.shadowBlur = 8;
      ctx.beginPath();
      for(var q=0;q<state.winLine.length;q++){
        var xx = pad+state.winLine[q][1]*cell, yy = pad+state.winLine[q][0]*cell;
        if(q===0) ctx.moveTo(xx,yy); else ctx.lineTo(xx,yy);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawStone(x,y,color,isLast,isBad){
    var rad = geom.cell * 0.455;
    ctx.save();
    ctx.beginPath(); ctx.arc(x,y,rad,0,Math.PI*2); ctx.closePath();
    ctx.shadowColor = isBad ? 'rgba(177,14,28,.5)' : 'rgba(0,0,0,.38)';
    ctx.shadowBlur = rad*0.45; ctx.shadowOffsetY = rad*0.2;
    var gr = ctx.createRadialGradient(x-rad*0.35,y-rad*0.42,rad*0.08,x,y,rad);
    if(color === 1){
      gr.addColorStop(0,'#7d7d7d'); gr.addColorStop(0.45,'#2b2b2b'); gr.addColorStop(1,'#050505');
    }else{
      gr.addColorStop(0,'#ffffff'); gr.addColorStop(0.55,'#f2f2f2'); gr.addColorStop(1,'#cfcfcf');
    }
    ctx.fillStyle = isBad ? '#e08a92' : gr;
    ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.lineWidth = 1;
    ctx.strokeStyle = color===1 ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.22)';
    ctx.stroke();
    if(isLast){
      ctx.beginPath(); ctx.arc(x,y,rad*0.18,0,Math.PI*2);
      ctx.fillStyle = color===1 ? '#e8e8e8' : '#444';
      ctx.fill();
    }
    if(isBad){
      ctx.strokeStyle = '#b10e1c'; ctx.lineWidth = Math.max(2,rad*0.2); ctx.lineCap='round';
      ctx.beginPath();
      ctx.moveTo(x-rad*0.42,y-rad*0.42); ctx.lineTo(x+rad*0.42,y+rad*0.42);
      ctx.moveTo(x+rad*0.42,y-rad*0.42); ctx.lineTo(x-rad*0.42,y+rad*0.42);
      ctx.stroke();
    }
    ctx.restore();
  }

  function eventToCell(e){
    var rect = canvas.getBoundingClientRect();
    if(!rect.width) return null;
    var x = e.clientX - rect.left, y = e.clientY - rect.top;
    var c = Math.round((x - geom.pad)/geom.cell);
    var r = Math.round((y - geom.pad)/geom.cell);
    if(r<0||r>=N||c<0||c>=N) return null;
    var gx = geom.pad + c*geom.cell, gy = geom.pad + r*geom.cell;
    if(Math.hypot(x-gx, y-gy) > geom.cell*0.62) return null;
    return {r:r, c:c};
  }

  /* ================= 棋形分析（供 AI 与禁手共用） ================= */
  function buildLine(r,c,dr,dc,color,board){
    var s = '';
    for(var k=-5;k<=5;k++){
      if(k === 0){ s += 'x'; continue; }
      var rr = r+k*dr, cc = c+k*dc;
      if(rr<0||rr>=N||cc<0||cc>=N){ s += '#'; continue; }
      var v = board[rr][cc];
      s += (v === color ? 'x' : (v === 0 ? '.' : '#'));
    }
    return s;
  }

  function analyzeLine(line){
    var start=5,end=5;
    while(start>0 && line[start-1]==='x') start--;
    while(end<10 && line[end+1]==='x') end++;
    var run = end-start+1;
    var leftOpen = start>0 && line[start-1]==='.';
    var rightOpen = end<10 && line[end+1]==='.';
    var endOpen = (leftOpen?1:0)+(rightOpen?1:0);

    // 再落一子能成五的位置数量（用于判断冲四/活四）
    var winPts = 0;
    for(var i=0;i<11;i++){
      if(line[i] !== '.') continue;
      var cur=0,mx=0;
      for(var j=0;j<11;j++){
        var ch = (j===i) ? 'x' : line[j];
        if(ch==='x'){ cur++; if(cur>mx) mx=cur; } else cur=0;
      }
      if(mx>=5) winPts++;
    }
    return {run:run, endOpen:endOpen, winPts:winPts};
  }

  // 是否可形成“活四”（.xxxx.），用于识别活三与跳三
  function canMakeOpenFour(line){
    for(var i=0;i<11;i++){
      if(line[i] !== '.') continue;
      var arr = line.split(''); arr[i] = 'x';
      var s2 = arr.join('');
      for(var j=0;j+5<11;j++){
        if(s2.slice(j,j+6) === '.xxxx.') return true;
      }
    }
    return false;
  }

  function patternValue(line){
    var a = analyzeLine(line);
    if(a.run >= 5) return 5000000;
    if(a.winPts >= 2) return 500000;   // 活四
    if(a.winPts >= 1) return 50000;    // 冲四 / 跳四
    if(canMakeOpenFour(line)) return 10000; // 活三
    if(a.run === 3) return a.endOpen===2 ? 3000 : 300;
    if(a.run === 2) return a.endOpen===2 ? 300 : 30;
    if(a.run === 1) return 8;
    return 0;
  }

  function evalPoint(r,c,color){
    var board = state.board;
    var old = board[r][c];
    board[r][c] = color;
    var total = 0;
    for(var d=0; d<4; d++){
      total += patternValue(buildLine(r,c,DIRS[d][0],DIRS[d][1],color,board));
    }
    board[r][c] = old;
    return total;
  }

  /* ================= 禁手判定（黑棋） ================= */
  // 返回 false 表示可落子，否则返回禁手名称
  function isForbidden(r,c){
    if(!state.forbidden) return false;
    var board = state.board;
    var old = board[r][c];
    board[r][c] = 1;
    var fourDirs = 0, threeDirs = 0, five = false, overline = false;

    for(var d=0; d<4; d++){
      var line = buildLine(r,c,DIRS[d][0],DIRS[d][1],1,board);
      var a = analyzeLine(line);
      if(a.run >= 6) overline = true;
      if(a.run === 5) five = true;
      if(a.run < 5){
        if(a.winPts >= 1) fourDirs++;
        if(canMakeOpenFour(line)) threeDirs++;
      }
    }
    board[r][c] = old;

    if(overline) return '长连禁手';
    if(five) return false;            // 成五优先，允许落子
    if(fourDirs >= 2) return '四四禁手';
    if(threeDirs >= 2) return '三三禁手';
    return false;
  }

  /* ================= 胜负判定 ================= */
  function hasFiveAt(r,c,color){
    var board = state.board;
    for(var d=0; d<4; d++){
      var dr=DIRS[d][0], dc=DIRS[d][1], n=1, k, rr, cc;
      for(k=1;;k++){ rr=r+k*dr; cc=c+k*dc; if(rr<0||rr>=N||cc<0||cc>=N||board[rr][cc]!==color) break; n++; }
      for(k=1;;k++){ rr=r-k*dr; cc=c-k*dc; if(rr<0||rr>=N||cc<0||cc>=N||board[rr][cc]!==color) break; n++; }
      if(color === 2 && n >= 5) return true;
      if(color === 1){
        if(state.forbidden){ if(n === 5) return true; }
        else if(n >= 5) return true;
      }
    }
    return false;
  }

  function checkWin(r,c,color){
    var board = state.board;
    for(var d=0; d<4; d++){
      var dr=DIRS[d][0], dc=DIRS[d][1];
      var fwd=[], bwd=[], k, rr, cc;
      for(k=1;;k++){ rr=r+k*dr; cc=c+k*dc; if(rr<0||rr>=N||cc<0||cc>=N||board[rr][cc]!==color) break; fwd.push([rr,cc]); }
      for(k=1;;k++){ rr=r-k*dr; cc=c-k*dc; if(rr<0||rr>=N||cc<0||cc>=N||board[rr][cc]!==color) break; bwd.push([rr,cc]); }
      var run = fwd.length + bwd.length + 1;
      var ok = (color === 2) ? (run >= 5) : (state.forbidden ? (run === 5) : (run >= 5));
      if(ok){
        var line = bwd.reverse().concat([[r,c]], fwd);
        return line;
      }
    }
    return null;
  }

  /* ================= AI ================= */
  function isNearStone(r,c,dist){
    for(var dr=-dist; dr<=dist; dr++){
      for(var dc=-dist; dc<=dist; dc++){
        if(dr===0 && dc===0) continue;
        var rr=r+dr, cc=c+dc;
        if(rr<0||rr>=N||cc<0||cc>=N) continue;
        if(state.board[rr][cc] !== 0) return true;
      }
    }
    return false;
  }

  function getCandidates(color, other, limit){
    var list = [], r, c;
    var hasAny = false;
    outer:
    for(r=0;r<N;r++){
      for(c=0;c<N;c++){
        if(state.board[r][c] !== 0){ hasAny = true; break outer; }
      }
    }
    if(!hasAny){
      var mid = Math.floor(N/2);
      return [{r:mid, c:mid, score:0}];
    }
    for(r=0;r<N;r++){
      for(c=0;c<N;c++){
        if(state.board[r][c] !== 0) continue;
        if(!isNearStone(r,c,2)) continue;
        var attack = evalPoint(r,c,color);
        var defend = evalPoint(r,c,other);
        var bias = (N - Math.abs(r-(N-1)/2) - Math.abs(c-(N-1)/2)) * 1.5;
        list.push({r:r, c:c, score: attack + defend*0.85 + bias});
      }
    }
    list.sort(function(a,b){ return b.score - a.score; });
    return list.slice(0, limit);
  }

  function evalBoard(color){
    var other = color===1?2:1, s=0, i;
    var a = getCandidates(color, other, 8);
    for(i=0;i<a.length;i++) s += evalPoint(a[i].r,a[i].c,color);
    var b = getCandidates(other, color, 8);
    for(i=0;i<b.length;i++) s -= evalPoint(b[i].r,b[i].c,other)*0.9;
    return s;
  }

  function negamax(color, depth, alpha, beta, beam, deadline){
    if(depth === 0 || performance.now() > deadline) return evalBoard(color);
    var other = color===1?2:1;
    var cands = getCandidates(color, other, beam);
    if(!cands.length) return 0;
    var best = -Infinity;
    for(var i=0;i<cands.length;i++){
      var m = cands[i];
      state.board[m.r][m.c] = color;
      var sc;
      if(hasFiveAt(m.r,m.c,color)) sc = 10000000 + depth;
      else if(color===1 && state.forbidden && isForbidden(m.r,m.c)) sc = -10000000;
      else sc = -negamax(other, depth-1, -beta, -alpha, Math.max(3, beam-1), deadline);
      state.board[m.r][m.c] = 0;
      if(sc > best) best = sc;
      if(best > alpha) alpha = best;
      if(alpha >= beta) break;
    }
    return best;
  }

  function chooseAiMove(){
    var ai = state.currentPlayer, human = ai===1?2:1;
    var cands = getCandidates(ai, human, 12);
    if(!cands.length){ var mid=Math.floor(N/2); return {r:mid,c:mid}; }

    if(state.difficulty === 'easy'){
      // 弱 AI：在前若干候选里随机挑选，保留基本棋感但容易出错
      var top = Math.min(cands.length, 6);
      return cands[Math.floor(Math.random()*top)];
    }

    // 无非是“能赢就赢，对方要赢就堵”
    var i, m;
    for(i=0;i<cands.length;i++){
      m = cands[i];
      state.board[m.r][m.c] = ai;
      var win = hasFiveAt(m.r,m.c,ai);
      state.board[m.r][m.c] = 0;
      if(win) return m;
    }
    var opp = getCandidates(human, ai, 12);
    for(i=0;i<opp.length;i++){
      m = opp[i];
      state.board[m.r][m.c] = human;
      var lose = hasFiveAt(m.r,m.c,human);
      state.board[m.r][m.c] = 0;
      if(lose) return m;
    }

    var legal = cands.filter(function(x){
      return !(ai===1 && state.forbidden && isForbidden(x.r,x.c));
    });
    if(!legal.length) legal = cands;

    if(state.difficulty === 'medium'){
      return legal[0];
    }

    // 困难：受限深度搜索 + 时间保护
    var roots = getCandidates(ai, human, 6).filter(function(x){
      return !(ai===1 && state.forbidden && isForbidden(x.r,x.c));
    });
    if(!roots.length) roots = legal;
    var bestMove = roots[0], best = -Infinity;
    var deadline = performance.now() + 1600;
    for(i=0;i<roots.length;i++){
      m = roots[i];
      state.board[m.r][m.c] = ai;
      var sc;
      if(hasFiveAt(m.r,m.c,ai)) sc = 100000000;
      else sc = -negamax(human, 2, -Infinity, Infinity, 5, deadline);
      state.board[m.r][m.c] = 0;
      if(sc > best){ best = sc; bestMove = m; }
      if(performance.now() > deadline) break;
    }
    return bestMove;
  }

  /* ================= 对局流程 ================= */
  function initGame(){
    clearTimeout(aiTimer); aiTimer = null;
    N = state.boardSize;
    state.board = [];
    for(var r=0;r<N;r++) state.board.push(new Array(N).fill(0));
    state.history = [];
    state.currentPlayer = state.firstPlayer;
    state.moveCount = 0;
    state.gameOver = false;
    state.winner = 0;
    state.winLine = null;
    state.lastMove = null;
    state.clocks = {1:0, 2:0};
    hover = null;
    lastTick = performance.now();
    resizeCanvas();
    updateUI();
    maybeAiMove();
  }

  function maybeAiMove(){
    clearTimeout(aiTimer); aiTimer = null;
    if(state.gameOver) return;
    if(state.mode === 'pve' && state.currentPlayer !== state.humanColor){
      setStatus(colorName(state.currentPlayer) + '（AI）思考中…');
      aiTimer = setTimeout(function(){
        aiTimer = null;
        if(state.gameOver) return;
        var mv = chooseAiMove();
        if(mv) placeStone(mv.r, mv.c);
      }, state.difficulty === 'hard' ? 480 : 320);
    }else{
      var who = state.mode === 'pve' ? '轮到你落子' : colorName(state.currentPlayer) + '落子';
      setStatus(who + ' · ' + colorName(state.currentPlayer));
    }
  }

  function placeStone(r,c){
    if(state.gameOver) return false;
    if(r<0||r>=N||c<0||c>=N) return false;
    if(state.board[r][c] !== 0) return false;
    var color = state.currentPlayer;
    if(color === 1 && state.forbidden){
      var f = isForbidden(r,c);
      if(f){
        setStatus('禁手！黑棋不能在此落子（' + f + '）', 'warn');
        drawBoard();
        return false;
      }
    }

    state.board[r][c] = color;
    state.history.push({r:r, c:c, color:color});
    state.moveCount = state.history.length;
    state.lastMove = {r:r, c:c, color:color};

    var line = checkWin(r,c,color);
    if(line){ endGame(color, line); return true; }
    if(state.moveCount >= 100){ endGame(0, null, '平局：已满 100 手'); return true; }

    state.currentPlayer = color===1 ? 2 : 1;
    hover = null;
    updateUI();
    drawBoard();
    maybeAiMove();
    return true;
  }

  function endGame(winner, line, reason){
    state.gameOver = true;
    state.winner = winner;
    state.winLine = line;
    clearTimeout(aiTimer); aiTimer = null;

    // 累计积分
    scores.total++;
    if(winner === 0){ scores.draws++; }
    else if(winner === 1){ scores.blackWins++; }
    else { scores.whiteWins++; }
    if(state.mode === 'pve'){
      if(winner === 0) scores.pveD++;
      else if(winner === state.humanColor) scores.pveW++;
      else scores.pveL++;
    }
    saveScores(); renderScores();

    var msg, type;
    if(winner === 0){ msg = reason || '平局'; type='draw'; }
    else if(state.mode === 'pve'){
      msg = winner === state.humanColor ? '恭喜，你赢了！' : 'AI 获胜，再来一局？'; type='win';
    }else{
      msg = colorName(winner) + '获胜！'; type='win';
    }
    setStatus(msg, type);
    updateUI();
    drawBoard();
  }

  function undo(){
    var count;
    if(state.history.length === 0) return;
    clearTimeout(aiTimer); aiTimer = null;
    if(state.mode === 'pve'){
      count = (state.currentPlayer === aiColor()) ? 1 : 2;
    }else{
      count = 1;
    }
    count = Math.min(count, state.history.length);
    for(var i=0;i<count;i++){
      var m = state.history.pop();
      state.board[m.r][m.c] = 0;
    }
    state.moveCount = state.history.length;
    state.lastMove = state.history.length ? Object.assign({}, state.history[state.history.length-1]) : null;
    state.gameOver = false;
    state.winner = 0;
    state.winLine = null;
    state.currentPlayer = state.history.length
      ? (state.history[state.history.length-1].color===1 ? 2 : 1)
      : state.firstPlayer;
    hover = null;
    updateUI();
    drawBoard();
    maybeAiMove();
  }

  function updateUI(){
    el.name1.textContent = '黑方';
    el.name2.textContent = '白方';
    if(state.mode === 'pve'){
      el.role1.textContent = state.humanColor===1 ? '玩家' : 'AI · ' + diffLabel();
      el.role2.textContent = state.humanColor===2 ? '玩家' : 'AI · ' + diffLabel();
    }else{
      el.role1.textContent = '玩家一';
      el.role2.textContent = '玩家二';
    }
    el.card1.classList.toggle('active', !state.gameOver && state.currentPlayer===1);
    el.card2.classList.toggle('active', !state.gameOver && state.currentPlayer===2);
    el.moveNo.textContent = state.moveCount;
    el.btnUndo.disabled = state.history.length === 0;
    el.forbidBadge.textContent = '禁手：' + (state.forbidden ? '开' : '关');
    el.forbidBadge.classList.toggle('on', state.forbidden);
    updateClocks();
  }
  function diffLabel(){ return {easy:'简单',medium:'中等',hard:'困难'}[state.difficulty]; }
  function updateClocks(){
    el.clock1.textContent = fmtTime(state.clocks[1]);
    el.clock2.textContent = fmtTime(state.clocks[2]);
  }

  /* ================= 事件绑定 ================= */
  function bindSegment(id, key, after, parse){
    var box = document.getElementById(id);
    box.addEventListener('click', function(e){
      var btn = e.target.closest('button');
      if(!btn || !box.contains(btn)) return;
      Array.prototype.forEach.call(box.querySelectorAll('button'), function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      state[key] = parse ? parse(btn.dataset.value) : btn.dataset.value;
      if(after) after();
    });
  }

  bindSegment('segMode', 'mode', function(){
    var pve = state.mode === 'pve';
    el.fieldDiff.classList.toggle('hidden', !pve);
    el.fieldColor.classList.toggle('hidden', !pve);
    initGame();
  });
  bindSegment('segDiff', 'difficulty', function(){
    if(state.mode==='pve' && !state.gameOver && state.currentPlayer===aiColor()) maybeAiMove();
    else updateUI();
  });
  bindSegment('segColor', 'humanColor', function(){ initGame(); }, function(v){ return parseInt(v,10); });
  bindSegment('segFirst', 'firstPlayer', function(){ initGame(); }, function(v){ return parseInt(v,10); });
  bindSegment('segSize', 'boardSize', function(){ initGame(); }, function(v){ return parseInt(v,10); });

  el.chkForbidden.addEventListener('change', function(){
    state.forbidden = el.chkForbidden.checked;
    updateUI(); drawBoard();
    if(!state.gameOver) setStatus(state.forbidden
      ? '禁手已开启：黑棋禁止三三、四四、长连'
      : '禁手已关闭：五连及以上均判胜');
  });

  el.settingsToggle.addEventListener('click', function(){
    var isOpen = el.settingsToggle.getAttribute('aria-expanded') === 'true';
    applySettingsOpen(!isOpen, true);
  });

  el.btnRestart.addEventListener('click', initGame);
  el.btnUndo.addEventListener('click', undo);

  document.addEventListener('keydown', function(e){
    if((e.ctrlKey || e.metaKey) && (e.key==='z' || e.key==='Z')){
      e.preventDefault(); undo();
    }
  });

  canvas.addEventListener('pointermove', function(e){
    if(e.pointerType !== 'mouse') return;
    var cell = eventToCell(e);
    if(cell && canHumanPlay() && state.board[cell.r][cell.c]===0){ hover = cell; }
    else hover = null;
    drawBoard();
  });
  canvas.addEventListener('pointerleave', function(){ hover=null; drawBoard(); });
  canvas.addEventListener('pointerdown', function(e){
    if(e.pointerType === 'mouse' && e.button !== 0) return;
    var cell = eventToCell(e);
    if(!cell) return;
    if(!canHumanPlay()) return;
    placeStone(cell.r, cell.c);
  });

  if(window.ResizeObserver){
    new ResizeObserver(function(){ resizeCanvas(); }).observe(canvas);
  }else{
    window.addEventListener('resize', resizeCanvas);
  }

  // 计时器
  setInterval(function(){
    var now = performance.now();
    var dt = now - lastTick;
    lastTick = now;
    if(!state.gameOver && dt > 0 && dt < 2000){
      state.clocks[state.currentPlayer] += dt;
      updateClocks();
    }
  }, 250);

  renderScores();
  applySettingsOpen(readSettingsOpen(), false);
  initGame();
})();
