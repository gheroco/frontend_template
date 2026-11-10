import { wave, wavelength } from './models.mjs';
import { motionEnabled, setMotion, subscribeMotion } from './motion.mjs';
// The travelling wave is extruded along z for visualization; it is not a material simulation.
export function initField(){
 const canvas=document.getElementById('field'),ctx=canvas.getContext('2d');if(!ctx)return;
 let width=640,height=540,t=0,last=0,frame=0,visible=true,frequency=1,amplitude=.8;
 const toggle=document.getElementById('motion-toggle'),frequencyInput=document.getElementById('hero-frequency');
 function project(x,y,z){const sx=x*.88+z*.42,depth=z*.65-x*.25,scale=Math.min(width/650,height/550);return [width*.5+sx*scale,height*.51+(depth*.44-y)*scale];}
 function stroke(points,color,lineWidth=1){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.stroke();}
 function draw(){
  ctx.clearRect(0,0,width,height);const light=document.documentElement.dataset.theme==='light',rgb=light?'21,109,131':'105,222,242',rgba=a=>'rgba('+rgb+','+a+')';
  const glow=ctx.createRadialGradient(width*.55,height*.45,10,width*.5,height*.5,width*.48);glow.addColorStop(0,light?'#168b9b12':'#206d9529');glow.addColorStop(.65,'#122b4a0a');glow.addColorStop(1,'#07101c00');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
  for(let z=-170;z<=170;z+=34)stroke([project(-270,-108,z),project(270,-108,z)],rgba(.10));
  for(let x=-270;x<=270;x+=45)stroke([project(x,-108,-170),project(x,-108,170)],rgba(.10));
  for(let z=-170;z<=170;z+=13.6){const points=[];for(let x=-270;x<=270;x+=3)points.push(project(x,wave({x:x/45,t,frequency,amplitude})*65,z));stroke(points,rgba(.15+.52*(z+170)/340),.8);}
  for(let x=-270;x<=270;x+=13.5){const y=wave({x:x/45,t,frequency,amplitude})*65;stroke([project(x,y,-170),project(x,y,170)],rgba(.19),.6);}
  const spine=[];for(let x=-270;x<=270;x+=3)spine.push(project(x,wave({x:x/45,t,frequency,amplitude})*65,0));
  ctx.shadowColor=light?'transparent':'#5edcf5';ctx.shadowBlur=14;stroke(spine,light?'#276c8f':'#9df1fa',2);ctx.shadowBlur=0;
  const point=project(0,wave({x:0,t,frequency,amplitude})*65,0),base=project(0,-108,0);
  ctx.setLineDash([3,5]);stroke([base,point],'#c3a77d77');ctx.setLineDash([]);ctx.fillStyle='#efc38b';ctx.beginPath();ctx.arc(...point,4,0,Math.PI*2);ctx.fill();
  const origin=project(-270,-108,170),end=project(270,-108,170);stroke([origin,end],rgba(.4));ctx.font='11px Manrope, sans-serif';ctx.fillStyle=light?'#386c7a':'#80a7ba';ctx.fillText('x',end[0]+12,end[1]+5);
 }
 function tick(now){frame=0;if(!visible||!motionEnabled()||document.hidden)return;if(last)t+=Math.min(now-last,50)/1000;last=now;draw();frame=requestAnimationFrame(tick);}
 function start(){cancelAnimationFrame(frame);frame=0;last=0;draw();if(visible&&motionEnabled()&&!document.hidden)frame=requestAnimationFrame(tick);}
 function label(){toggle.setAttribute('aria-pressed',String(!motionEnabled()));toggle.querySelector('span').textContent=motionEnabled()?'Пауза':'Движение выключено';}
 function resize(){const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;width=r.width;height=r.height;const d=Math.min(devicePixelRatio||1,2);canvas.width=width*d;canvas.height=height*d;ctx.setTransform(d,0,0,d,0,0);draw();}
 toggle.onclick=()=>setMotion(!motionEnabled());
 frequencyInput?.addEventListener('input',()=>{frequency=Number(frequencyInput.value);document.getElementById('hero-frequency-value').textContent=frequency.toLocaleString('ru-RU')+' Гц';document.getElementById('hero-wavelength').textContent=wavelength(frequency).toLocaleString('ru-RU',{maximumFractionDigits:2})+' м';draw();});
 document.getElementById('hero-reset')?.addEventListener('click',()=>{t=0;frequency=1;frequencyInput.value='1';frequencyInput.dispatchEvent(new Event('input'));draw();});
 subscribeMotion(()=>{label();start();});new ResizeObserver(resize).observe(canvas);new MutationObserver(draw).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;start();}).observe(canvas);document.addEventListener('visibilitychange',start);label();resize();start();
}
