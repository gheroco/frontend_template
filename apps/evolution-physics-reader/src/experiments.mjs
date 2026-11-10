import { wave, wavelength, relativeVelocity, photoelectric, gamma, fallDistance, electricField } from './models.mjs';
import { motionEnabled, subscribeMotion } from './motion.mjs';
import { escapeHTML as esc, icon } from './core.mjs';

export const EXPERIMENTS = {
  waves: { title: 'Что движется в волне?', lesson: 'section-17', question: 'Измените частоту. Что станет с расстоянием между гребнями?', formula: 'y(x,t) = A sin[2πf(x/v − t)] · λ = v/f', controls: [['frequency','Частота f','Гц',0.5,3,0.1,1],['amplitude','Амплитуда A','м',0.2,1.5,0.1,0.8]], assumptions: 'Идеальная линейная поперечная волна. Скорость v = 4 м/с постоянна; x и y в метрах, t в секундах. Нет дисперсии, затухания и переноса среды. Масштабы осей различаются. Это модель струны, а не точная модель воды или света.', reference: 'waves' },
  frames: { title: 'Два наблюдателя. Одно движение.', lesson: 'section-25', question: 'При какой скорости наблюдателя объект покажется неподвижным?', formula: 'x = 5 + ut · x′ = 5 + (u − v)t', controls: [['objectVelocity','Скорость объекта u','м/с',-5,5,0.5,3],['frameVelocity','Скорость наблюдателя v','м/с',-5,5,0.5,1]], assumptions: 'Галилеево преобразование: общее время, равномерное прямолинейное движение, совпадение начал отсчёта при t = 0. Начальная координата объекта 5 м. Показаны 4 с движения. Скорости намного меньше скорости света; модель не применяется к свету.' },
  fields: { title: 'Как заряд меняет пространство', lesson: 'section-21', question: 'Сравните поле противоположных и одинаковых зарядов.', formula: 'E ∝ Σ qᵢ(r − rᵢ) / |r − rᵢ|³', controls: [], assumptions: 'Два неподвижных точечных заряда одинакового модуля. Координаты и масштаб поля условные. Стрелки нормированы и показывают направление, а не величину. Области вблизи точек исключены. Нет движения пробного заряда; линии не являются его траекториями.' },
  lightclock: { title: 'Почему движущиеся часы идут иначе', lesson: 'section-27', question: 'Как меняется интервал между двумя событиями при росте скорости?', formula: 'γ = 1 / √(1 − β²) · Δt = γΔτ · β = v/c', controls: [['beta','Скорость v/c','',0,0.95,0.01,0.6]], assumptions: 'Идеальные световые часы; инерциальные системы, движение поперёк расстояния между зеркалами. Собственный интервал одного прохода Δτ = 1 с. Сравниваются два одинаковых прибора, покоящийся и движущийся в одной внешней системе. Масштабы горизонтальной и вертикальной осей различаются. Диаграмма пути не в масштабе реального прибора. Визуальное воспроизведение замедлено; это не полёт фотона по экрану в реальном масштабе.' },
  elevator: { title: 'Внутри лифта', lesson: 'section-31', question: 'Различаются ли локальные траектории шара в этих двух кабинах?', formula: 's = ½at² · tпад = √(2h/a)', controls: [['acceleration','Ускорение a','м/с²',1,15,0.1,9.8]], assumptions: 'Высота h = 2 м. Слева неподвижная кабина в однородном поле g = a; справа кабина ускоряется вверх в пустоте. Шар отпущен без начальной относительной скорости. Нерелятивистское локальное приближение без сопротивления и приливных сил. После касания пола движение останавливается.' },
  photoelectric: { title: 'Когда свет выбивает электрон', lesson: 'section-37', question: 'Поможет ли увеличение яркости, если энергии фотона недостаточно?', formula: 'E = hc/λ · Kmax = E − W · W = 2,3 эВ', controls: [['wavelengthNm','Длина волны λ','нм',300,750,5,450],['intensity','Интенсивность','%',10,100,10,50]], assumptions: 'Однофотонный фотоэффект с условной работой выхода 2,3 эВ. Интенсивность меняет число падающих фотонов, а не энергию каждого. Электроны показаны схематично с одинаковой скоростью: анимация не изображает распределение их энергий. Нет многофотонных процессов, нагрева и обратного напряжения.', reference: 'photoelectric' }
};
const num = (v, digits=2) => Number(v).toLocaleString('ru-RU', {maximumFractionDigits:digits});

export function mountExperiment(host, type, { sourceLink = '#', references = [] } = {}) {
  const d = EXPERIMENTS[type]; if (!d) return () => {};
  const values = Object.fromEntries(d.controls.map(c => [c[0], c[6]])); values.rightCharge = -1;
  host.innerHTML = `<div class="experiment-head"><span class="eyebrow">ЭКСПЕРИМЕНТ · УЧЕБНАЯ МОДЕЛЬ</span><h3>${d.title}</h3><p>${d.question}</p></div>
    <div class="experiment-visual"><canvas width="640" height="400" role="img" aria-label="${esc(d.title)}. Числовой и текстовый эквивалент приведён под изображением."></canvas><span class="experiment-time"></span></div>
    <div class="experiment-transport"><button class="button small experiment-pause" ${type==='fields'?'hidden':''}>${icon('pause')}<span>Пауза</span></button><button class="button small experiment-reset">${icon('return')} Сбросить</button>${type==='fields'?'<span class="static-label">Статическое поле</span>':''}</div>
    <div class="experiment-controls">${d.controls.map(([key,label,unit,min,max,step,value])=>`<label><span>${label}<output for="exp-${type}-${key}">${num(value)} ${unit}</output></span><input id="exp-${type}-${key}" data-param="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}${unit?', '+unit:''}"></label>`).join('')}${type==='fields'?'<label><span>Правый заряд</span><select aria-label="Знак правого заряда" data-param="rightCharge"><option value="-1">−q · противоположные заряды</option><option value="1">+q · одинаковые заряды</option></select></label>':''}</div>
    <div class="experiment-result" role="status" aria-live="polite"></div><div class="experiment-formula">${esc(d.formula)}</div>
    <details class="model-details"><summary>Модель, обозначения и ограничения</summary><p>${d.assumptions}</p>${type==='photoelectric'?'<p>h — постоянная Планка; c — скорость света; E — энергия фотона; W — работа выхода; Kmax — максимальная энергия электрона. 1 эВ = 1,602176634 × 10⁻¹⁹ Дж. При E ≤ W в модели нет электронов с положительной энергией выхода.</p>':''}${type==='lightclock'?'<p>Δτ — интервал часов в собственной системе; Δt — интервал другой инерциальной системы. c — скорость света, v — относительная скорость.</p>':''}<p>Это дополнительная визуализация. Оригинальные рисунки книги сохранены отдельно.</p>${references.filter(r=>r.id===d.reference||(type==='photoelectric'&&r.id==='constants')).map(r=>`<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.title)} ↗</a>`).join('')}</details><a class="quiet-link experiment-source" href="${sourceLink}">К исходному рассуждению ${icon('arrow')}</a>`;
  const canvas=host.querySelector('canvas'),ctx=canvas.getContext('2d'),result=host.querySelector('.experiment-result'),pause=host.querySelector('.experiment-pause');
  let t=0, paused=!motionEnabled(),frame=0,last=0,dead=false,visible=true;
  const width=640,height=400;
  const color={cyan:'#72e9f4',violet:'#bca4ff',amber:'#f1c483',dim:'#7b98af',line:'#21364b',text:'#edf1ed'};
  function line(x1,y1,x2,y2,c=color.line,w=1){ctx.strokeStyle=c;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
  function circle(x,y,r,c){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=c;ctx.fill();}
  function label(text,x,y,c=color.dim,size=15){ctx.font=`${size}px Manrope, sans-serif`;ctx.fillStyle=c;ctx.fillText(text,x,y);}
  function arrow(x,y,dx,dy,c=color.cyan){line(x,y,x+dx,y+dy,c,1.2);const a=Math.atan2(dy,dx),ex=x+dx,ey=y+dy;line(ex,ey,ex-5*Math.cos(a-.5),ey-5*Math.sin(a-.5),c);line(ex,ey,ex-5*Math.cos(a+.5),ey-5*Math.sin(a+.5),c);}
  function draw(){
    if(!ctx||dead)return;ctx.clearRect(0,0,width,height);ctx.fillStyle='#07131f';ctx.fillRect(0,0,width,height);
    for(let x=40;x<width;x+=40)line(x,24,x,height-24);for(let y=40;y<height;y+=40)line(24,y,width-24,y);
    if(type==='waves'){
      const scaleX=56,scaleY=74;line(40,200,600,200,'#537087');ctx.beginPath();
      for(let i=0;i<=560;i++){const y=200-wave({x:i/scaleX,t,...values})*scaleY;i?ctx.lineTo(40+i,y):ctx.moveTo(40+i,y);}ctx.strokeStyle=color.cyan;ctx.lineWidth=2.5;ctx.stroke();
      const y=200-wave({x:4,t,...values})*scaleY;line(264,65,264,335,'#69534a');circle(264,y,6,color.amber);
      for(let x=0;x<=10;x+=2)label(String(x),36+x*scaleX,227);label('x, м',555,255);label('y, м',45,45);label('+1',10,130);label('−1',10,280);label('Отмеченная точка: x = 4 м',265,365,color.amber,13);
    }else if(type==='frames'){
      const dx=relativeVelocity(values.objectVelocity,values.frameVelocity),map=x=>320+x*8;
      [110,260].forEach((y,i)=>{line(55,y,585,y,'#58758b');for(let k=-30;k<=30;k+=10){line(map(k),y-6,map(k),y+6,'#58758b');label(String(k),map(k)-8,y+30);}const v=i?dx:values.objectVelocity,x=map(5+v*t);circle(x,y,9,i?color.violet:color.cyan);arrow(x,y-30,v*9,0,i?color.violet:color.cyan);});
      label('Система земли · x, м',40,48,color.cyan);label('Система наблюдателя · x′, м',40,207,color.violet);label('Общий момент времени: '+num(t,1)+' с',40,370);
    }else if(type==='fields'){
      for(let y=48;y<365;y+=28)for(let x=30;x<620;x+=28){const fx=(x-320)/110,fy=(200-y)/110,f=electricField(fx,fy,values.rightCharge);if(!f)continue;const m=Math.hypot(f.x,f.y);if(m<1e-7)continue;arrow(x,y,f.x/m*14,-f.y/m*14,'#5997b0');}
      for(const [x,q] of [[210,1],[430,values.rightCharge]]){const glow=ctx.createRadialGradient(x,200,5,x,200,44);glow.addColorStop(0,q>0?'#72e9f450':'#bca4ff50');glow.addColorStop(1,'#07131f00');ctx.fillStyle=glow;ctx.fillRect(x-44,156,88,88);circle(x,200,18,q>0?color.cyan:color.violet);label(q>0?'+':'−',x-8,207,'#07131f',24);}
      label('Направление силы на положительный заряд',40,375,color.text,14);
    }else if(type==='lightclock'){
      const g=gamma(values.beta),rest=Math.min(t,1),moving=Math.min(t/g,1),start=365,shift=60*values.beta*t;
      label('Покой · собственные часы',35,42,color.cyan,14);label('Движение · внешняя система',320,42,color.violet,14);
      for(const y of [80,300]){line(95,y,185,y,color.cyan,3);line(start+shift-28,y,start+shift+28,y,color.violet,3);}
      line(140,300,140,80,color.cyan,2);line(start,300,start+60*values.beta*g,80,color.violet,2);
      circle(140,300-rest*220,7,color.amber);circle(start+shift,300-moving*220,7,color.amber);
      label('Δτ = 1 с',75,350,color.cyan,21);label('Δt = '+num(g)+' с',335,350,color.violet,21);
      label('t = '+num(t,2)+' с · масштабы x и y различаются',130,388,color.dim,12);
    }else if(type==='elevator'){
      const distance=Math.min(2,fallDistance(t,values.acceleration));
      for(const [x,caption,c] of [[100,'Поле g = a',color.cyan],[380,'Кабина ↑ a',color.violet]]){ctx.strokeStyle=c;ctx.lineWidth=1.4;ctx.strokeRect(x,70,155,250);circle(x+78,95+distance*100,8,color.amber);line(x+25,300,x+130,300,c,3);label(caption,x,45,c);label('h = 2 м',x+40,350);}
      arrow(290,120,0,70,color.cyan);arrow(560,260,0,-70,color.violet);
    }else if(type==='photoelectric'){
      const p=photoelectric(values.wavelengthNm);ctx.fillStyle='#31485a';ctx.fillRect(290,90,28,240);label('Металл',265,360,color.text);
      const count=Math.max(1,Math.round(values.intensity/20));
      for(let i=0;i<count;i++){const y=110+i*180/Math.max(1,count-1);const phase=(t*.5+i*.22)%1;circle(35+phase*240,y,5,color.cyan);line(35+phase*240-25,y,35+phase*240-8,y,color.cyan,2);if(p.emits){circle(330+phase*240,y,4,color.amber);}}
      label('Фотоны',48,55,color.cyan);label(p.emits?'Электроны':'Эмиссии нет',405,55,p.emits?color.amber:color.dim);label('E = '+num(p.energyEv)+' эВ',48,385,color.cyan);label('Kmax = '+num(p.kineticEv)+' эВ',390,385,color.amber);
    }
    host.querySelector('.experiment-time').textContent=['fields','photoelectric','waves','lightclock'].includes(type)?'':`t = ${num(t,2)} с`;
  }
  function updateResult(){
    const v=values;
    if(type==='waves')result.textContent=`При f = ${num(v.frequency)} Гц длина волны λ = ${num(wavelength(v.frequency))} м. Точка колеблется с амплитудой ${num(v.amplitude)} м, её координата x остаётся 4 м. Частота меняет расстояние между гребнями; амплитуда не меняет скорость.`;
    if(type==='frames')result.textContent=`Скорость объекта относительно земли: ${num(v.objectVelocity)} м/с; относительно наблюдателя: ${num(relativeVelocity(v.objectVelocity,v.frameVelocity))} м/с. ${v.objectVelocity===v.frameVelocity?'Для наблюдателя объект неподвижен.':'Отрицательный знак означает движение в противоположном направлении оси.'}`;
    if(type==='fields')result.textContent=v.rightCharge<0?'Поле диполя: линии идут от положительного заряда к отрицательному. В середине поля зарядов складываются.':'Два положительных заряда: стрелки направлены от обоих источников. В точном центре поля компенсируются. Стрелки показывают направление, не величину.';
    if(type==='lightclock')result.textContent=`v = ${num(v.beta)}c; γ = ${num(gamma(v.beta),3)}. Собственному интервалу 1 с соответствует ${num(gamma(v.beta),3)} с в другой инерциальной системе. Чем выше скорость, тем больше отношение интервалов.`;
    if(type==='elevator')result.textContent=`В обеих кабинах относительное падение с 2 м занимает ${num(Math.sqrt(4/v.acceleration),3)} с. Увеличение ускорения уменьшает это время. В нашей локальной модели траектории совпадают.`;
    if(type==='photoelectric'){const p=photoelectric(v.wavelengthNm);result.textContent=`Энергия фотона ${num(p.energyEv,3)} эВ. ${p.emits?`Эмиссия есть; Kmax = ${num(p.kineticEv,3)} эВ.`:'Энергии недостаточно: эмиссии нет.'} Порог λ ≈ ${num(p.thresholdNm,1)} нм. Интенсивность ${v.intensity}% меняет число фотонов, но не их энергию.`;}
    host.querySelectorAll('input[data-param]').forEach(input=>{const c=d.controls.find(c=>c[0]===input.dataset.param);input.closest('label').querySelector('output').textContent=`${num(values[c[0]])} ${c[2]}`;input.setAttribute('aria-valuetext',`${num(values[c[0]])} ${c[2]}`);});
    pause.querySelector('span').textContent=paused?'Запустить':'Пауза';pause.setAttribute('aria-pressed',String(paused));
  }
  function tick(now){frame=0;if(dead||paused||!motionEnabled()||!visible||document.hidden)return;if(last)t+=Math.min(now-last,50)/1000;last=now;
    const end=type==='frames'?4:type==='elevator'?Math.sqrt(4/values.acceleration):type==='lightclock'?gamma(values.beta):Infinity;if(t>=end){t=end;paused=true;updateResult();}
    draw();if(!paused)frame=requestAnimationFrame(tick);
  }
  function start(){cancelAnimationFrame(frame);frame=0;last=0;draw();if(!paused&&motionEnabled()&&visible&&type!=='fields')frame=requestAnimationFrame(tick);}
  pause.onclick=()=>{if(!motionEnabled()){paused=true;result.textContent='Анимация отключена. Включите движение кнопкой в верхней панели; статическая модель и все расчёты доступны.';return;}paused=!paused;if((type==='frames'&&t>=4)||(type==='elevator'&&t>=Math.sqrt(4/values.acceleration))||(type==='lightclock'&&t>=gamma(values.beta)))t=0;updateResult();start();};
  host.querySelector('.experiment-reset').onclick=()=>{for(const c of d.controls){values[c[0]]=c[6];host.querySelector(`[data-param="${c[0]}"]`).value=c[6];}values.rightCharge=-1;const sel=host.querySelector('select');if(sel)sel.value='-1';t=0;paused=!motionEnabled();updateResult();start();};
  host.querySelectorAll('[data-param]').forEach(input=>input.addEventListener('input',()=>{values[input.dataset.param]=Number(input.value);if(['frames','elevator','lightclock'].includes(type))t=0;updateResult();draw();}));
  const unsubscribe=subscribeMotion(on=>{paused=!on;updateResult();start();});
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;start();});observer.observe(host);
  const visibility=()=>start();document.addEventListener('visibilitychange',visibility);updateResult();start();
  return ()=>{dead=true;cancelAnimationFrame(frame);unsubscribe();observer.disconnect();document.removeEventListener('visibilitychange',visibility);};
}
