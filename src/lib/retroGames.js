// Retro Game Speed Build — the three sample arcade games.
//
// Ported verbatim from the gamesystem deck's play hub
// (flag-retrieval.vercel.app/gamesystem → #/play/jump), which teams are shown
// so they know what they are rebuilding with AI. Kept as plain JS rather than
// rewritten in TS: it is dense canvas game code and a faithful copy is far
// easier to diff against the original than a re-typed one.
//
// Each game takes (canvas, hudEl, keysEl) and returns { stop() } — call stop()
// to cancel the animation frame and detach the key listeners.

// Set by arcadeKeys() so a newly started game can retire the previous binding.
let ARCADE_KEYS = null

function arcadeKeys(){
  const k={};
  const MAP={arrowleft:"left",a:"left",arrowright:"right",d:"right",arrowup:"up",w:"up",arrowdown:"down",s:"down"," ":"jump",enter:"enter"};
  const dn=e=>{ const key=MAP[e.key.toLowerCase()]; if(key){ k[key]=true; e.preventDefault(); } };
  const up=e=>{ const key=MAP[e.key.toLowerCase()]; if(key){ k[key]=false; e.preventDefault(); } };
  window.addEventListener("keydown",dn); window.addEventListener("keyup",up);
  k._off=()=>{ window.removeEventListener("keydown",dn); window.removeEventListener("keyup",up); if(ARCADE_KEYS===k)ARCADE_KEYS=null; };
  ARCADE_KEYS=k;
  return k;
}

function arcadeLoop(step,draw,k){
  // fixed 60Hz logic step regardless of display refresh rate
  let raf, last=performance.now(), acc=0;
  const loop=now=>{
    acc+=Math.min(200,now-last); last=now;
    while(acc>=16.67){ step(); acc-=16.67; }
    draw(); raf=requestAnimationFrame(loop);
  };
  raf=requestAnimationFrame(loop);
  return {stop(){ cancelAnimationFrame(raf); k._off(); }};
}

function arcadeText(ctx,W,H,big,small){
  ctx.fillStyle="#000a"; ctx.fillRect(0,H/2-90,W,180);
  ctx.textAlign="center"; ctx.fillStyle="#fff";
  ctx.font="900 52px Segoe UI,system-ui,sans-serif"; ctx.fillText(big,W/2,H/2-10);
  ctx.font="700 22px Segoe UI,system-ui,sans-serif"; ctx.fillStyle="#fbbf24"; ctx.fillText(small,W/2,H/2+40);
}

function gameJump(cv,hud,keysEl){
  const W=960,H=520,T=40; cv.width=W; cv.height=H;
  const ctx=cv.getContext("2d");
  keysEl.textContent="← → / A D move · Space jump · Enter restart · Esc close";
  const ROWS=[
    "",
    "",
    "              ooo            ooo",
    "             =====          =====",
    "",
    "                                     ooo          ooo               ooo",
    "       =o=                          =====        =====     ===    =====",
    "",
    "        o             oo                     o                             o",
    "      =====          ====        ==o==      ===        ====      ==      ===",
    "  P        E        E         E          E          E         E        E",
    "#############   #################   ##########################   ###############",
    "#############   #################   ##########################   ###############",
  ].map(r=>r.padEnd(84," "));
  const COLS=84, WORLD=COLS*T;
  const solid=(c,r)=>{ if(c<0||c>=COLS)return true; if(r<0)return false; if(r>=ROWS.length)return false; const ch=ROWS[r][c]; return ch==="#"||ch==="="; };
  let p,coins,enemies,flag,cam,score,lives,st,tick;
  function init(){
    coins=[]; enemies=[]; flag=null;
    for(let r=0;r<ROWS.length;r++)for(let c=0;c<COLS;c++){
      const ch=ROWS[r][c];
      if(ch==="o")coins.push({x:c*T+T/2,y:r*T+T/2,got:false});
      if(ch==="E")enemies.push({x:c*T+T/2,y:r*T+T-16,dir:-1,dead:false});
      if(ch==="F")flag={x:c*T+T/2,y:r*T};
      if(ch==="P")p={x:c*T+8,y:r*T,vx:0,vy:0,w:26,h:36,ground:false,face:1};
    }
    if(!flag)flag={x:(COLS-4)*T,y:9*T};
    cam=0; score=0; lives=3; st="play"; tick=0;
  }
  function respawn(){ p.x=T+8; p.y=10*T-40; p.vx=0; p.vy=0; cam=0; }
  const k=arcadeKeys();
  function hurt(){ lives--; if(lives<=0){st="over";} else respawn(); }
  function step(){
    tick++;
    if(st!=="play"){ if(k.enter||k.jump)init(); return; }
    // input
    if(k.left){p.vx-=.6;p.face=-1} if(k.right){p.vx+=.6;p.face=1}
    p.vx*=.85; p.vx=Math.max(-5,Math.min(5,p.vx));
    if(k.jump&&p.ground){p.vy=-13;p.ground=false;}
    p.vy+=.6; p.vy=Math.min(14,p.vy);
    // X move + collide
    p.x+=p.vx;
    let c0=Math.floor(p.x/T),c1=Math.floor((p.x+p.w)/T),r0=Math.floor(p.y/T),r1=Math.floor((p.y+p.h-1)/T);
    for(let r=r0;r<=r1;r++){ if(p.vx>0&&solid(c1,r)){p.x=c1*T-p.w-0.01;p.vx=0;} if(p.vx<0&&solid(c0,r)){p.x=(c0+1)*T+0.01;p.vx=0;} }
    // Y move + collide
    p.y+=p.vy; p.ground=false;
    c0=Math.floor(p.x/T);c1=Math.floor((p.x+p.w)/T);r0=Math.floor(p.y/T);r1=Math.floor((p.y+p.h)/T);
    for(let c=c0;c<=c1;c++){
      if(p.vy>0&&solid(c,r1)){p.y=r1*T-p.h-0.01;p.vy=0;p.ground=true;}
      if(p.vy<0&&solid(c,r0)){p.y=(r0+1)*T+0.01;p.vy=0;}
    }
    if(p.y>H+80)hurt();
    // coins
    coins.forEach(o=>{ if(!o.got&&Math.abs(p.x+p.w/2-o.x)<26&&Math.abs(p.y+p.h/2-o.y)<28){o.got=true;score+=50;} });
    // enemies
    enemies.forEach(e=>{
      if(e.dead)return;
      e.x+=e.dir*1.3;
      const ec=Math.floor((e.x+e.dir*14)/T), er=Math.floor((e.y+14)/T);
      if(solid(ec,Math.floor(e.y/T))||!solid(ec,er)) e.dir*=-1;
      const dx=(p.x+p.w/2)-e.x, dy=(p.y+p.h/2)-(e.y-2);
      if(Math.abs(dx)<24&&Math.abs(dy)<26){
        if(p.vy>2&&dy<-4){e.dead=true;score+=100;p.vy=-8;}
        else hurt();
      }
    });
    // flag
    if(Math.abs(p.x+p.w/2-flag.x)<24&&p.y+p.h>flag.y-10){st="win";score+=500;}
    cam=Math.max(0,Math.min(WORLD-W,p.x-360));
  }
  function draw(){
    const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,"#131335"); g.addColorStop(1,"#2b1b52");
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    // parallax hills
    ctx.fillStyle="#1d1d46";
    for(let i=0;i<7;i++){ const hx=((i*520)-(cam*.4))%(WORLD)-100; ctx.beginPath(); ctx.arc(hx,H,180,Math.PI,0); ctx.fill(); }
    ctx.save(); ctx.translate(-cam,0);
    // tiles
    const cA=Math.floor(cam/T), cB=Math.min(COLS-1,Math.ceil((cam+W)/T));
    for(let r=0;r<ROWS.length;r++)for(let c=cA;c<=cB;c++){
      const ch=ROWS[r][c];
      if(ch==="#"){ ctx.fillStyle="#5b3a29"; ctx.fillRect(c*T,r*T,T,T);
        if(!solid(c,r-1)){ctx.fillStyle="#34d399";ctx.fillRect(c*T,r*T,T,9);}
        ctx.strokeStyle="#0006"; ctx.strokeRect(c*T+.5,r*T+.5,T-1,T-1); }
      if(ch==="="){ ctx.fillStyle="#f59e0b"; ctx.fillRect(c*T,r*T+6,T,T-14);
        ctx.strokeStyle="#0007"; ctx.strokeRect(c*T+.5,r*T+6.5,T-1,T-15); }
    }
    // coins
    coins.forEach(o=>{ if(o.got)return; const w=8+6*Math.abs(Math.sin(tick*.1+o.x));
      ctx.fillStyle="#fde047"; ctx.beginPath(); ctx.ellipse(o.x,o.y,w,13,0,0,7); ctx.fill();
      ctx.strokeStyle="#b45309"; ctx.stroke(); });
    // flag
    ctx.fillStyle="#e5e7eb"; ctx.fillRect(flag.x-3,flag.y-150,6,150);
    ctx.fillStyle="#22d3ee"; ctx.beginPath(); ctx.moveTo(flag.x+3,flag.y-150); ctx.lineTo(flag.x+52,flag.y-132); ctx.lineTo(flag.x+3,flag.y-114); ctx.fill();
    // enemies
    enemies.forEach(e=>{ if(e.dead)return;
      ctx.fillStyle="#a855f7"; ctx.beginPath(); ctx.arc(e.x,e.y,15,Math.PI,0); ctx.fill(); ctx.fillRect(e.x-15,e.y-1,30,12);
      ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(e.x-6,e.y-4,4.5,0,7); ctx.arc(e.x+6,e.y-4,4.5,0,7); ctx.fill();
      ctx.fillStyle="#000"; ctx.beginPath(); ctx.arc(e.x-6+e.dir*2,e.y-4,2,0,7); ctx.arc(e.x+6+e.dir*2,e.y-4,2,0,7); ctx.fill(); });
    // player
    ctx.fillStyle="#ef4444"; ctx.fillRect(p.x,p.y,p.w,14);
    ctx.fillStyle="#3b82f6"; ctx.fillRect(p.x,p.y+14,p.w,p.h-14);
    ctx.fillStyle="#fcd9b8"; ctx.fillRect(p.x+4,p.y+3,p.w-8,9);
    ctx.fillStyle="#000"; ctx.fillRect(p.x+(p.face>0?p.w-10:4),p.y+5,4,4);
    ctx.restore();
    if(st==="win")arcadeText(ctx,W,H,"🏁 LEVEL CLEAR!","Enter = play again · Esc = close");
    if(st==="over")arcadeText(ctx,W,H,"💀 GAME OVER","Enter = try again · Esc = close");
    hud.innerHTML=`<span>🍄 SUPER JUMPMAN</span><span>⭐ ${score}</span><span>❤️ ${lives}</span>`;
  }
  init();
  return arcadeLoop(step,draw,k);
}

function gameChomp(cv,hud,keysEl){
  const MAPS=[
    "###################",
    "#........#........#",
    "#o##.###.#.###.##o#",
    "#.................#",
    "#.##.#.#####.#.##.#",
    "#....#...#...#....#",
    "####.###.#.###.####",
    "   #.#...G...#.#   ",
    "####.#.#####.#.####",
    "#........#........#",
    "#.##.###.#.###.##.#",
    "#o.#.....P.....#.o#",
    "##.#.#.#####.#.#.##",
    "#....#...#...#....#",
    "###################",
  ];
  const CO=19,RO=15,T=34,W=CO*T,H=RO*T; cv.width=W; cv.height=H;
  const ctx=cv.getContext("2d");
  keysEl.textContent="← ↑ ↓ → / WASD move · Enter restart · Esc close";
  const wall=(c,r)=>{ c=((c%CO)+CO)%CO; if(r<0||r>=RO)return true; return MAPS[r][c]==="#"; };
  const GCOLS=["#f43f5e","#22d3ee","#fbbf24"];
  let dots,pac,ghosts,score,lives,st,fright,tick,total;
  function ent(c,r){ return {x:c*T+T/2,y:r*T+T/2,dir:[0,0],want:[0,0]}; }
  let pacHome=[9,11],gHome=[9,7];
  function init(){
    dots={}; total=0;
    for(let r=0;r<RO;r++)for(let c=0;c<CO;c++){ const ch=MAPS[r][c];
      if(ch==="."){dots[c+","+r]=1;total++;} if(ch==="o"){dots[c+","+r]=2;total++;}
      if(ch==="P")pacHome=[c,r]; if(ch==="G")gHome=[c,r]; }
    score=0; lives=3; st="play"; fright=0; tick=0;
    resetPos();
  }
  function resetPos(){
    pac=ent(...pacHome); pac.dir=[0,0]; pac.want=[0,0];
    ghosts=GCOLS.map((col,i)=>{ const g=ent(gHome[0]-1+i,gHome[1]); g.col=col; g.dir=[0,-1]; g.wait=140+i*200; return g; });
    fright=0;
  }
  const k=arcadeKeys();
  const atCenter=e=>Math.abs((e.x-T/2)%T)<2.6&&Math.abs((e.y-T/2)%T)<2.6;
  const tileOf=e=>[Math.round((e.x-T/2)/T),Math.round((e.y-T/2)/T)];
  function tryDir(e,d,sp){
    const [c,r]=tileOf(e);
    if(!wall(c+d[0],r+d[1])){e.dir=d;return true;} return false;
  }
  function move(e,sp){
    e.x+=e.dir[0]*sp; e.y+=e.dir[1]*sp;
    if(e.x<-T/2)e.x=W+T/2-1; if(e.x>W+T/2)e.x=-T/2+1;
    const [c,r]=tileOf(e);
    if(e.dir[0]&&wall(c+e.dir[0],r)&&atCenter(e)){e.x=c*T+T/2;e.dir=[0,0];}
    if(e.dir[1]&&wall(c,r+e.dir[1])&&atCenter(e)){e.y=r*T+T/2;e.dir=[0,0];}
    if(e.dir[0])e.y+= (r*T+T/2-e.y)*.3; if(e.dir[1])e.x+=(c*T+T/2-e.x)*.3;
  }
  function step(){
    tick++;
    if(st!=="play"){ if(k.enter||k.jump)init(); return; }
    if(fright>0)fright--;
    // pac input
    if(k.left)pac.want=[-1,0]; if(k.right)pac.want=[1,0]; if(k.up)pac.want=[0,-1]; if(k.down)pac.want=[0,1];
    if((pac.want[0]!==pac.dir[0]||pac.want[1]!==pac.dir[1])&&atCenter(pac)) tryDir(pac,pac.want);
    if(pac.want[0]===-pac.dir[0]&&pac.want[1]===-pac.dir[1]&&(pac.dir[0]||pac.dir[1])) pac.dir=pac.want.slice();
    move(pac,2.6);
    // eat
    const [pc,pr]=tileOf(pac), key=pc+","+pr;
    if(dots[key]){ score+=dots[key]===2?50:10; if(dots[key]===2)fright=420; delete dots[key]; total--; if(total<=0)st="win"; }
    // ghosts
    ghosts.forEach(g=>{
      if(g.wait>0){g.wait--;return;}
      if(atCenter(g)){
        const [c,r]=tileOf(g);
        const opts=[[1,0],[-1,0],[0,1],[0,-1]].filter(d=>!(d[0]===-g.dir[0]&&d[1]===-g.dir[1])&&!wall(c+d[0],r+d[1]));
        if(opts.length){
          let best;
          if(Math.random()<.38) best=opts[Math.floor(Math.random()*opts.length)];
          else{
            const dist=d=>{const dx=(c+d[0])-pc,dy=(r+d[1])-pr;return dx*dx+dy*dy;};
            opts.sort((a,b)=>dist(a)-dist(b));
            best=fright>0?opts[opts.length-1]:opts[0];
          }
          g.dir=best;
        }
      }
      move(g,fright>0?1.5:1.9);
      const dx=g.x-pac.x,dy=g.y-pac.y;
      if(dx*dx+dy*dy<380){
        if(fright>0){ score+=200; g.x=gHome[0]*T+T/2; g.y=gHome[1]*T+T/2; g.wait=120; g.dir=[0,-1]; }
        else{ lives--; if(lives<=0)st="over"; else resetPos(); }
      }
    });
  }
  function draw(){
    ctx.fillStyle="#050514"; ctx.fillRect(0,0,W,H);
    for(let r=0;r<RO;r++)for(let c=0;c<CO;c++){
      if(MAPS[r][c]==="#"){ ctx.fillStyle="#1e1b6b"; ctx.fillRect(c*T+2,r*T+2,T-4,T-4);
        ctx.strokeStyle="#4f46e5"; ctx.strokeRect(c*T+2.5,r*T+2.5,T-5,T-5); }
    }
    for(const key in dots){ const [c,r]=key.split(",").map(Number);
      ctx.fillStyle="#fde047"; ctx.beginPath();
      ctx.arc(c*T+T/2,r*T+T/2,dots[key]===2?(7+2*Math.sin(tick*.15)):3.5,0,7); ctx.fill(); }
    // pac
    const ang=Math.atan2(pac.dir[1],pac.dir[0])||0, mouth=.28+.22*Math.sin(tick*.25);
    ctx.fillStyle="#facc15"; ctx.beginPath();
    ctx.moveTo(pac.x,pac.y); ctx.arc(pac.x,pac.y,14,ang+mouth,ang-mouth); ctx.closePath(); ctx.fill();
    // ghosts
    ghosts.forEach(g=>{
      const col=fright>0?((fright<120&&Math.floor(tick/10)%2)?"#fff":"#3b82f6"):g.col;
      ctx.fillStyle=col; ctx.beginPath(); ctx.arc(g.x,g.y-2,13,Math.PI,0);
      ctx.lineTo(g.x+13,g.y+11);
      for(let i=2;i>=-2;i--) ctx.lineTo(g.x+i*6.5-3.25,g.y+11-((i+10)%2?5:0));
      ctx.closePath(); ctx.fill();
      ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(g.x-5,g.y-4,4,0,7); ctx.arc(g.x+5,g.y-4,4,0,7); ctx.fill();
      ctx.fillStyle="#1e1b4b"; ctx.beginPath(); ctx.arc(g.x-5+g.dir[0]*2,g.y-4+g.dir[1]*2,2,0,7); ctx.arc(g.x+5+g.dir[0]*2,g.y-4+g.dir[1]*2,2,0,7); ctx.fill();
    });
    if(st==="win")arcadeText(ctx,W,H,"🎉 MAZE CLEARED!","Enter = play again · Esc = close");
    if(st==="over")arcadeText(ctx,W,H,"👻 GAME OVER","Enter = try again · Esc = close");
    hud.innerHTML=`<span>👻 CHOMP MAZE</span><span>⭐ ${score}</span><span>❤️ ${lives}</span>`;
  }
  init();
  return arcadeLoop(step,draw,k);
}

function gameBarrel(cv,hud,keysEl){
  const W=960,H=600; cv.width=W; cv.height=H;
  const ctx=cv.getContext("2d");
  keysEl.textContent="← → move · ↑ ↓ climb ladders · Space jump · Enter restart · Esc close";
  // girders bottom(0)→top(5); barrels roll downhill
  const G=[...Array(6)].map((_,i)=>{ const d=(i%2)?1:-1, s=.018*d; return {cy:555-90*i, s, d}; });
  const gy=(i,x)=>G[i].cy+G[i].s*(x-480);
  const LAD=[ // {lo: lower girder idx, x}
    {lo:0,x:180},{lo:0,x:820},{lo:1,x:90},{lo:1,x:620},{lo:2,x:320},{lo:2,x:880},
    {lo:3,x:150},{lo:3,x:700},{lo:4,x:430},{lo:4,x:870},
  ];
  const TOP={x1:40,x2:230,y:52}, TL={x:120}; // princess platform + its ladder from girder 5
  const KONG={x:300}, SPAWN=220;
  let p,bars,score,lives,st,tick;
  function init(){ bars=[]; score=0; lives=3; st="play"; tick=0; respawn(); }
  function respawn(){ p={x:70,g:0,y:0,vy:0,jump:false,climb:null,onTop:false,face:1,inv:110}; p.y=gy(0,p.x)-17; }
  const k=arcadeKeys();
  function hurt(){ lives--; if(lives<=0)st="over"; else respawn(); }
  function step(){
    tick++;
    if(st!=="play"){ if(k.enter||k.jump)init(); return; }
    if(p.inv>0)p.inv--;
    // spawn barrels
    if(tick%SPAWN===1&&bars.length<6) bars.push({x:KONG.x+40,g:5,y:gy(5,KONG.x+40)-11,climb:null,scored:false,rot:0});
    // player
    if(p.climb!==null){
      const L=p.climb;
      const topY=L.top? TOP.y : gy(L.lo+1,L.x), botY=L.top? gy(5,L.x) : gy(L.lo,L.x);
      if(k.up)p.y-=2.4; if(k.down)p.y+=2.4;
      p.x=L.x;
      if(p.y-17<=topY-17){ p.y=topY-17; if(L.top){p.onTop=true;p.climb=null;st="win";score+=1000;} else {p.g=L.lo+1;p.climb=null;} }
      if(p.y>=botY-17){ p.y=botY-17; p.g=L.lo; p.climb=null; }
    } else if(!p.onTop){
      if(k.left){p.x-=3;p.face=-1} if(k.right){p.x+=3;p.face=1}
      p.x=Math.max(14,Math.min(W-14,p.x));
      if(p.jump){ p.vy+=.55; p.y+=p.vy; if(p.y>=gy(p.g,p.x)-17){p.y=gy(p.g,p.x)-17;p.jump=false;p.vy=0;} }
      else{
        p.y=gy(p.g,p.x)-17;
        if(k.jump){p.jump=true;p.vy=-9;}
        // grab ladder
        if(k.up||k.down){
          for(const L of LAD){
            if(Math.abs(p.x-L.x)<16){
              if(k.up&&L.lo+1<=5&&p.g===L.lo){p.climb=L;break;}
              if(k.down&&p.g===L.lo+1){p.climb=L;break;}
            }
          }
          if(!p.climb&&p.g===5&&k.up&&Math.abs(p.x-TL.x)<16){p.climb={lo:4,x:TL.x,top:true};}
        }
      }
    }
    // barrels
    bars.forEach(b=>{
      b.rot+=.2;
      if(b.climb!==null){
        const L=b.climb; b.y+=2.6; b.x=L.x;
        if(b.y>=gy(L.lo,L.x)-11){ b.y=gy(L.lo,L.x)-11; b.g=L.lo; b.climb=null; }
      } else {
        b.x+=G[b.g].d*2.7;
        if(b.x<-25||b.x>W+25){
          if(b.g===0){ b.dead=true; score+=25; }
          else{ b.g--; b.x=Math.max(-20,Math.min(W+20,b.x)); }
        }
        b.y=gy(b.g,Math.max(0,Math.min(W,b.x)))-11;
        // maybe take a ladder down
        for(const L of LAD){
          if(L.lo+1===b.g&&Math.abs(b.x-L.x)<4&&Math.random()<.12){ b.climb=L; break; }
        }
      }
      // jump-over bonus
      if(!b.scored&&p.jump&&b.g===p.g&&Math.abs(b.x-p.x)<28&&b.y-p.y>20){ b.scored=true; score+=100; }
      // hit player
      const dx=b.x-p.x, dy=b.y-(p.y+2);
      if(dx*dx+dy*dy<540&&st==="play"&&p.inv<=0) hurt();
    });
    bars=bars.filter(b=>!b.dead);
  }
  function drawLadder(x,y1,y2){
    ctx.strokeStyle="#22d3ee"; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(x-9,y1); ctx.lineTo(x-9,y2); ctx.moveTo(x+9,y1); ctx.lineTo(x+9,y2); ctx.stroke();
    for(let y=y1+6;y<y2;y+=12){ ctx.beginPath(); ctx.moveTo(x-9,y); ctx.lineTo(x+9,y); ctx.stroke(); }
    ctx.lineWidth=1;
  }
  function draw(){
    const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,"#0b0b22"); g.addColorStop(1,"#26103e");
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    // ladders behind girders
    LAD.forEach(L=>drawLadder(L.x,gy(L.lo+1,L.x),gy(L.lo,L.x)));
    drawLadder(TL.x,TOP.y,gy(5,TL.x));
    // girders
    G.forEach((gr,i)=>{ ctx.strokeStyle="#f43f5e"; ctx.lineWidth=8; ctx.beginPath();
      ctx.moveTo(0,gy(i,0)); ctx.lineTo(W,gy(i,W)); ctx.stroke();
      ctx.strokeStyle="#be123c"; ctx.lineWidth=2;
      for(let x=10;x<W;x+=34){ ctx.beginPath(); ctx.moveTo(x,gy(i,x)-4); ctx.lineTo(x+14,gy(i,x+14)+4); ctx.stroke(); }
    });
    ctx.lineWidth=1;
    // princess platform
    ctx.strokeStyle="#f472b6"; ctx.lineWidth=8; ctx.beginPath(); ctx.moveTo(TOP.x1,TOP.y); ctx.lineTo(TOP.x2,TOP.y); ctx.stroke(); ctx.lineWidth=1;
    // princess
    ctx.fillStyle="#f9a8d4"; ctx.fillRect(126,TOP.y-34,18,24);
    ctx.fillStyle="#fcd9b8"; ctx.beginPath(); ctx.arc(135,TOP.y-40,9,0,7); ctx.fill();
    ctx.fillStyle="#fff"; ctx.font="700 13px Segoe UI"; ctx.fillText("HELP!",160,TOP.y-42);
    // kong
    const kx=KONG.x, ky=gy(5,kx);
    ctx.fillStyle="#7c4a21"; ctx.beginPath(); ctx.arc(kx,ky-32,26,0,7); ctx.fill();
    ctx.fillStyle="#5b3a29"; ctx.beginPath(); ctx.arc(kx-24,ky-18,11,0,7); ctx.arc(kx+24,ky-18,11,0,7); ctx.fill();
    ctx.fillStyle="#e7c9a9"; ctx.beginPath(); ctx.arc(kx,ky-26,13,0,7); ctx.fill();
    ctx.fillStyle="#000"; ctx.beginPath(); ctx.arc(kx-5,ky-32,2.6,0,7); ctx.arc(kx+5,ky-32,2.6,0,7); ctx.fill();
    // barrels
    bars.forEach(b=>{ ctx.fillStyle="#f59e0b"; ctx.beginPath(); ctx.arc(b.x,b.y,11,0,7); ctx.fill();
      ctx.strokeStyle="#92400e"; ctx.beginPath(); ctx.arc(b.x,b.y,11,0,7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(b.x-11*Math.cos(b.rot),b.y-11*Math.sin(b.rot)); ctx.lineTo(b.x+11*Math.cos(b.rot),b.y+11*Math.sin(b.rot)); ctx.stroke(); });
    // player (blinks while invulnerable)
    if(!(p.inv>0&&Math.floor(tick/5)%2)){
      ctx.fillStyle="#3b82f6"; ctx.fillRect(p.x-9,p.y-4,18,21);
      ctx.fillStyle="#ef4444"; ctx.fillRect(p.x-9,p.y-12,18,8);
      ctx.fillStyle="#fcd9b8"; ctx.beginPath(); ctx.arc(p.x,p.y-16,8,0,7); ctx.fill();
      ctx.fillStyle="#000"; ctx.fillRect(p.x+(p.face>0?2:-5),p.y-18,3,3);
    }
    if(st==="win")arcadeText(ctx,W,H,"💖 RESCUED!","Enter = play again · Esc = close");
    if(st==="over")arcadeText(ctx,W,H,"🛢️ GAME OVER","Enter = try again · Esc = close");
    hud.innerHTML=`<span>🦍 BARREL CLIMB</span><span>⭐ ${score}</span><span>❤️ ${lives}</span>`;
  }
  init();
  return arcadeLoop(step,draw,k);
}

export { gameJump, gameChomp, gameBarrel }
