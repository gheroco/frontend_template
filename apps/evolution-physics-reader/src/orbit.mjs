import { wave, wavelength } from './models.mjs';
import { motionEnabled, setMotion, subscribeMotion } from './motion.mjs';

// A transverse travelling wave, extruded across z. The highlighted particle has
// a fixed x coordinate: the disturbance travels, the medium does not travel with it.
export function initField(){
 const canvas=document.getElementById('field'),ctx=canvas.getContext('2d');if(!ctx)return;
 let width=640,height=580,t=.3,last=0,frame=0,visible=true,frequency=1;
 const toggle=document.getElementById('motion-toggle'),input=document.getElementById('hero-frequency');
 const y=x=>wave({x:x/70,t,frequency,amplitude:.85})*76;
 function project(x,y,z){
  const mobile=width<500,scale=Math.min(width/610,height/530),depth=z*.55-x*.2;
  return [width*.51+(x*.91+z*.52)*scale,height*(mobile?.39:.45)+(depth*.63-y)*scale];
 }
 function path(points){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));}
 function stroke(points,color,lineWidth=1){path(points);ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.stroke();}
 function draw(){
  ctx.clearRect(0,0,width,height);
  const light=document.documentElement.dataset.theme==='light',rgb=light?'25,112,113':'135,231,225',color=a=>`rgba(${rgb},${a})`;
  const cx=width*.51,cy=height*.43,r=width*.43;
  const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,r);glow.addColorStop(0,light?'#73b8a21c':'#3b7e982b');glow.addColorStop(1,'#15385200');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
  // Ground grid makes the vertical oscillation and fixed particle location legible.
  for(let z=-180;z<=180;z+=36)stroke([project(-290,-104,z),project(290,-104,z)],color(.11));
  for(let x=-280;x<=280;x+=35)stroke([project(x,-104,-180),project(x,-104,180)],color(.10));
  const rows=[];for(let z=-160;z<=160;z+=16){const points=[];for(let x=-280;x<=280;x+=4)points.push(project(x,y(x),z));rows.push(points);}
  for(let i=0;i<rows.length-1;i++){path([...rows[i],...[...rows[i+1]].reverse()]);ctx.closePath();ctx.fillStyle=light?'#18747706':`rgba(42,125,142,${.018+i*.001})`;ctx.fill();}
  rows.forEach((points,i)=>stroke(points,color(.18+i/rows.length*.5),.75));
  for(let x=-280;x<=280;x+=14)stroke([project(x,y(x),-160),project(x,y(x),160)],color(.15),.65);
  const spine=[];for(let x=-280;x<=280;x+=3)spine.push(project(x,y(x),0));
  ctx.shadowColor=light?'transparent':'#82f4de';ctx.shadowBlur=13;stroke(spine,light?'#1c7771':'#c7fff0',1.6);ctx.shadowBlur=0;
  const marker=project(0,y(0),0),base=project(0,-104,0);ctx.setLineDash([3,5]);stroke([base,marker],light?'#9e6a3299':'#f2bc7e80');ctx.setLineDash([]);
  ctx.strokeStyle=light?'#9e6a323b':'#f2bc7e38';ctx.beginPath();ctx.ellipse(...base,7,3,0,0,Math.PI*2);ctx.stroke();
  ctx.shadowColor='#f2bc7e';ctx.shadowBlur=14;ctx.fillStyle=light?'#a76e2e':'#ffd2a0';ctx.beginPath();ctx.arc(...marker,4,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
  const from=project(175,-104,182),to=project(278,-104,182);stroke([from,to],color(.65));const angle=Math.atan2(to[1]-from[1],to[0]-from[0]);stroke([[to[0]-7*Math.cos(angle-.4),to[1]-7*Math.sin(angle-.4)],to,[to[0]-7*Math.cos(angle+.4),to[1]-7*Math.sin(angle+.4)]],color(.65));
  ctx.font='9px Mono, monospace';ctx.fillStyle=light?'#456d70':'#87acb9';ctx.fillText('x',to[0]+8,to[1]+3);
 }
 function tick(now){frame=0;if(!visible||!motionEnabled()||document.hidden)return;if(last)t+=Math.min(now-last,50)/1000;last=now;draw();frame=requestAnimationFrame(tick);}
 function start(){cancelAnimationFrame(frame);frame=0;last=0;draw();if(visible&&motionEnabled()&&!document.hidden)frame=requestAnimationFrame(tick);}
 function label(){const enabled=motionEnabled();toggle.setAttribute('aria-pressed',String(!enabled));toggle.setAttribute('aria-label',enabled?'Приостановить движение волны':'Включить движение волны');toggle.querySelector('span').textContent=enabled?'Пауза':'Пуск';}
 function resize(){const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;width=r.width;height=r.height;const d=Math.min(devicePixelRatio||1,2);canvas.width=width*d;canvas.height=height*d;ctx.setTransform(d,0,0,d,0,0);draw();}
 toggle.onclick=()=>setMotion(!motionEnabled());
 input.addEventListener('input',()=>{frequency=Number(input.value);document.getElementById('hero-frequency-value').textContent=frequency.toLocaleString('ru-RU')+' Гц';document.getElementById('hero-wavelength').textContent=wavelength(frequency).toLocaleString('ru-RU',{maximumFractionDigits:2})+' м';draw();});
 document.getElementById('hero-reset').addEventListener('click',()=>{t=.3;frequency=1;input.value='1';input.dispatchEvent(new Event('input'));draw();});
 subscribeMotion(()=>{label();start();});new ResizeObserver(resize).observe(canvas);new MutationObserver(draw).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;start();}).observe(canvas);document.addEventListener('visibilitychange',start);label();resize();start();
}
