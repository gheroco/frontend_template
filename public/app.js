import * as Store from './store.js';
import { AudioPractice } from './recorder.js';

const $ = (selector, root=document) => root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rich = value => esc(value).replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>');
const num = n => String(n).padStart(2,'0');
const names = {home:'Your studio',course:'Your 30-day course',phrases:'Your phrasebook',films:'The cinema room',progress:'Your progress',lesson:'Your daily practice'};
const paths = {
home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-8H9v8H4a1 1 0 0 1-1-1z"/>',
book:'<path d="M12 5v16M3 3c4-1 6 0 9 2 3-2 5-3 9-2v16c-4-1-6 0-9 2-3-2-5-3-9-2z"/>',
chat:'<path d="M21 11a8 8 0 0 1-8 8H6l-4 3 1-7a8 8 0 1 1 18-4Z"/><path d="M7 9h10M7 13h6"/>',
film:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4"/>',
chart:'<path d="M4 3v18h17M8 16v-5M13 16V6M18 16V9"/>',
headphones:'<path d="M3 14v-3a9 9 0 0 1 18 0v3"/><rect x="3" y="12" width="4" height="8" rx="2"/><rect x="17" y="12" width="4" height="8" rx="2"/>',
clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
check:'<path d="m5 12 4 4L19 6"/>',
play:'<path d="m8 5 11 7-11 7z"/>',
pause:'<path d="M8 5v14M16 5v14"/>',
reset:'<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
mic:'<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
stop:'<rect x="6" y="6" width="12" height="12" rx="1"/>',
volume:'<path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
bookmark:'<path d="M6 3h12v19l-6-4-6 4z"/>',
spark:'<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>',
wave:'<path d="M3 10v4M7 6v12M11 3v18M15 7v10M19 5v14M23 10v4"/>',
calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18M7 15h3M14 15h3"/>',
briefcase:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12a22 22 0 0 0 18 0M10 13h4"/>',
search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/>',
close:'<path d="m6 6 12 12M6 18 18 6"/>',
download:'<path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/>',
upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 15v6h16v-6"/>',
copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>',
globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
leaf:'<path d="M20 3C7 1 1 9 6 16c7 5 15-1 14-13ZM5 21l10-12"/>',
trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',
sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1"/>'
};
const icon = (name, cls='') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.spark}</svg>`;
const phases=[{id:'recall',name:'Recall',hy:'Հիշել',minutes:10,icon:'spark'},{id:'listen',name:'Listen & read',hy:'Լսել և կարդալ',minutes:20,icon:'headphones'},{id:'language',name:'Build your language',hy:'Կառուցվածքներ',minutes:15,icon:'book'},{id:'conversation',name:'Have a conversation',hy:'Երկխոսություն',minutes:45,icon:'chat'},{id:'transfer',name:'Try it differently',hy:'Կրկնել և փոխել',minutes:20,icon:'reset'},{id:'record',name:'Record & reflect',hy:'Պահել արդյունքը',minutes:10,icon:'mic'}];
const phaseOrder = day => day===30 ? [phases[0],phases[3],phases[1],phases[2],phases[4],phases[5]] : phases;
let course, route={view:'home'}, courseWeek=0, courseSearch='', phraseFilter='all', phraseSearch='', phraseLimit=24, flashIndex=0, flashShown=false;
let timer={key:'',remaining:600,end:null}, toastTimeout, recorderStatus='', audioUrls=[], recorderRefresh=0, pendingImport=null, modalReturnFocus=null;
const audio = new AudioPractice({onStatus:message=>{recorderStatus=message;const el=$('#recorder-status');if(el)el.textContent=message;else notify(message);},onChange:()=>{refreshRecorder();updateClock();}});

function notify(message) {const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove('show'),3500);}
function safeSave(ok) {const label=$('[data-storage-status]');if(label)label.textContent=Store.isPersistent()?'Saved on this device':'Session only · export progress';if(!ok)notify('Storage is unavailable. Export your progress before closing this tab.');return ok;}
function lesson(n) {return course.days[n-1];}
function activeDay() {const d=Store.getState().lastDay;return Store.dayState(d).steps.length<6?d:(course.days.find(x=>Store.dayState(x.day).steps.length<6)?.day||30);}
function nextStep(n) {return phaseOrder(n).find(p=>!Store.dayState(n).steps.includes(p.id))?.id||'recall';}
function lessonURL(n,step=nextStep(n)) {return `#/lesson/${n}/${step}`;}
function external(url,label,cls='btn btn-secondary') {return `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}<span class="screen-reader-only"> (opens a new tab)</span></a>`;}
function navLinks(mobile=false) {return [['home','home',mobile?'Home':'Overview'],['course','book',mobile?'Course':'My 30 days'],['phrases','chat',mobile?'Phrases':'Phrasebook'],['films','film',mobile?'Films':'Cinema room'],['progress','chart','Progress']].map(([view,i,label])=>`<a class="nav-link ${route.view===view||(view==='course'&&route.view==='lesson')?'active':''}" href="#/${view}" ${route.view===view?'aria-current="page"':''}>${icon(i,'nav-icon')}<span>${label}</span>${!mobile&&view==='course'?'<span class="nav-count">30</span>':''}</a>`).join('');}
function shell(content) {
  const s=Store.stats();
  return `<div class="app-shell"><aside class="sidebar" aria-label="Main navigation"><a class="brand" href="#/home" aria-label="Fluent 30 home"><span class="brand-mark">f.</span><span><span class="brand-name">fluent<span class="brand-slash"> /30</span></span><span class="brand-sub">YOUR SPEAKING STUDIO</span></span></a><nav>${navLinks()}</nav><div class="sidebar-bottom"><div class="sidebar-progress"><span class="eyebrow">YOUR COMMITMENT</span><p class="sidebar-progress-title">A little, every day.</p><div class="progress-track"><div class="progress-fill" style="width:${s.percent}%"></div></div><div class="sidebar-progress-meta"><span>${s.completed} of 30 days</span><strong>${s.percent}%</strong></div></div><button class="nav-link" data-action="guide">${icon('info')}<span>How to use your course</span></button><div class="profile"><span class="avatar">G</span><div><strong>Georgi’s workspace</strong><span>English, on your terms</span></div></div></div></aside><div class="app-main"><header class="topbar"><a class="mobile-brand" href="#/home"><span class="brand-mark">f.</span><span>fluent /30</span></a><span class="topbar-title">${esc(names[route.view])}</span><div class="topbar-actions"><span class="topbar-language">English practice <span>·</span> Հայերեն ուղեցույց</span><button class="icon-btn" data-action="settings" aria-label="Settings and backup">${icon('settings')}</button></div></header><main id="main-content" class="page" tabindex="-1">${content}</main><footer class="app-footer"><span>30 days. One conversation at a time.</span><button class="text-link" data-action="settings" data-storage-status>${Store.isPersistent()?'Saved on this device':'Session only · export progress'}</button></footer></div><nav class="mobile-nav" aria-label="Mobile navigation">${navLinks(true)}</nav></div>`;
}

function dashboard() {
  const n=activeDay(), d=lesson(n), s=Store.stats(), done=Store.dayState(n).steps;
  const phrase=d.chunks[0];
  return `<section class="hero"><div class="hero-copy"><span class="hero-tag">${icon('leaf')} YOUR NEXT CHAPTER STARTS HERE</span><h1 class="display-title">Find your words.<br><em>Make them yours.</em></h1><p class="hero-description">Your 30-day path to clearer, more confident English. A little structure. A lot of speaking.</p><p class="hero-hy" lang="hy">Ամեն օր մի փոքր ավելի վստահ։</p><div class="hero-actions"><a class="btn btn-primary" href="${lessonURL(n)}">${icon('play')}${done.length?'Continue my lesson':'Start my first lesson'}</a><button class="btn btn-ghost" data-action="guide">How it works</button></div><div class="metric-row"><div class="metric"><span class="metric-value">30</span><span class="metric-label">guided days</span></div><div class="metric"><span class="metric-value">2h</span><span class="metric-label">daily practice</span></div><div class="metric"><span class="metric-value">45–60</span><span class="metric-label">minutes speaking</span></div></div></div><div class="hero-art" aria-hidden="true"><span class="hero-art-note">A voice that’s<br>more <em>you.</em></span><span class="hero-art-label">PRACTISE. SPEAK. REPEAT.</span></div></section><section class="section-head"><div><span class="eyebrow">ONE DAY AT A TIME</span><h2 class="section-title">Your next conversation</h2></div><a class="text-link" href="#/course">See all 30 days</a></section><div class="dashboard-grid"><article class="card today-card"><div class="today-heading"><div><span class="day-kicker">DAY ${num(n)} <span> / 30</span></span><h3 class="today-title">${esc(d.title_en)}</h3><p lang="hy" class="muted">${esc(d.title_hy)}</p></div><span class="today-icon">${icon(d.icon)}</span></div><div class="meta-row"><span class="meta-item">${icon('clock')}120 min</span><span class="meta-item">${icon('book')}6 practice blocks</span><span class="badge">${esc(d.primary.level)}</span></div><div class="session-list">${phaseOrder(n).map((p,i)=>`<a class="session-row ${done.includes(p.id)?'is-complete':''}" href="${lessonURL(n,p.id)}"><span class="session-number">${done.includes(p.id)?icon('check'):num(i+1)}</span><span class="session-info"><span class="session-title">${p.name}</span><span class="session-sub" lang="hy">${p.hy}</span></span><span class="session-duration">${p.minutes} min</span><span class="session-check">${icon(done.includes(p.id)?'check':p.icon)}</span></a>`).join('')}</div><div class="today-bottom"><span class="muted">${done.length} of 6 blocks completed</span><a class="btn btn-primary btn-small" href="${lessonURL(n)}">${done.length?'Keep going':'Open lesson'}${icon('play')}</a></div></article><aside class="dashboard-aside"><article class="quote-card"><span class="eyebrow">MAKE THIS PHRASE YOURS</span><div class="quote-mark" aria-hidden="true">“</div><p class="quote-en">${esc(phrase.en)}</p><p class="quote-hy" lang="hy">${esc(phrase.hy)}</p><p class="quote-tip">Say it aloud. Change one detail.<br>Use it in a real conversation.</p><button class="btn btn-secondary btn-small" data-action="speak" data-text="${esc(phrase.en)}">${icon('volume')}Hear the phrase</button></article><article class="card card-pad mini-progress"><div class="section-head"><h3>Your momentum</h3>${icon('chart')}</div><p class="momentum-number">${s.completed}<span> / 30 days</span></p><div class="progress-track"><div class="progress-fill" style="width:${s.percent}%"></div></div><p class="muted">${s.blocks?`${s.blocks} practice blocks completed. Keep showing up.`:'Your first small step starts something good.'}</p><a class="text-link" href="#/progress">View your progress</a></article></aside></div><section class="section-head"><div><span class="eyebrow">THE BIG PICTURE</span><h2 class="section-title">Four chapters. Your voice.</h2></div><span class="muted desktop-only">Built around the conversations you need.</span></section><div class="week-grid">${course.weeks.map(w=>weekCard(w)).join('')}</div><section class="film-banner"><div class="film-banner-icon">${icon('film')}</div><div><span class="eyebrow">CHANGE THE SCENE</span><h2>Good stories. Better conversations.</h2><p>Four film sessions to bring your English into the real world.</p></div><a class="btn btn-secondary" href="#/films">Enter the cinema room</a></section>`;
}

function weekCard(w) {
  const done=w.days.filter(n=>Store.dayState(n).steps.length===6).length;
  return `<a class="week-card" href="#/course?week=${w.id}"><div class="week-top"><span class="week-number">CHAPTER ${num(w.id)}</span>${icon(['chat','briefcase','spark','wave'][w.id-1])}</div><h3 class="week-title">${esc(w.title_en)}</h3><p class="week-description">${esc(w.description_en)}</p><div class="day-dots">${w.days.map(n=>`<span class="day-dot ${Store.dayState(n).steps.length===6?'done':n===activeDay()?'current':''}">${n}</span>`).join('')}</div><div class="week-bottom"><span>Days ${w.days[0]}–${w.days.at(-1)}</span><span>${done}/${w.days.length} complete</span></div></a>`;
}

function courseCards() {
  const q=courseSearch.toLowerCase();
  const days=course.days.filter(d=>(!courseWeek||d.week===courseWeek)&&[d.title_en,d.title_hy,d.short_en,...d.chunks.map(c=>c.en)].join(' ').toLowerCase().includes(q));
  if(!days.length)return '<div class="empty-state"><h3>No lessons found</h3><p>Try another word or choose all chapters.</p></div>';
  return `<div class="course-list">${days.map(d=>{const st=Store.dayState(d.day),done=st.steps.length===6;return `<article class="lesson-card"><div class="lesson-card-top"><span class="lesson-number">${num(d.day)}</span><span class="badge ${done?'badge-complete':''}">${done?'Completed':st.steps.length?'In progress':`Chapter ${d.week}`}</span></div><div class="lesson-category">${icon(d.icon)}${esc(d.category_en)}</div><h2 class="lesson-title">${esc(d.title_en)}</h2><p class="lesson-hy" lang="hy">${esc(d.title_hy)}</p><p class="lesson-summary">${esc(d.short_en)}</p><div class="lesson-card-bottom"><div class="meta-row"><span>${icon('clock')}120 min</span><span>${st.steps.length}/6 blocks</span></div><a class="btn ${done?'btn-secondary':'btn-primary'} btn-small" href="${lessonURL(d.day)}">${done?'Revisit lesson':st.steps.length?'Continue':'Open lesson'}</a></div></article>`;}).join('')}</div>`;
}

function coursePage() {
  return `<div class="page-heading"><span class="eyebrow">YOUR MONTH, MAPPED OUT</span><h1>30 days to a stronger voice.</h1><p>A complete daily plan. Open any day, work at your level, and keep the conversation going.</p></div><div class="filter-row"><div class="view-tabs" role="group" aria-label="Filter course by chapter">${[0,1,2,3,4].map(w=>`<button class="tab ${courseWeek===w?'active':''}" data-action="week" data-week="${w}" aria-pressed="${courseWeek===w}">${w?`Chapter ${w}`:'All days'}</button>`).join('')}</div><label class="search-box">${icon('search')}<input type="search" id="course-search" placeholder="Find a lesson or phrase" aria-label="Search lessons" value="${esc(courseSearch)}"></label></div><div id="course-results">${courseCards()}</div>`;
}

function resourceCard(r,scope) {return `<article class="resource-card"><span class="resource-icon">${icon(r.type?.includes('քերական')?'book':'headphones')}</span><div class="resource-body"><span class="eyebrow">TODAY’S RESOURCE ${r.level?`· ${esc(r.level)}`:''}</span><h3 class="resource-title">${esc(r.title)}</h3>${scope?`<p lang="hy">${rich(scope)}</p>`:''}${external(r.url,`${icon('globe')}Open lesson`)}</div></article>`;}
function taskInputs(d,type,items) {const st=Store.dayState(d.day);return `<div class="task-list">${items.map((q,i)=>`<div class="task-item"><span class="task-number">${i+1}</span><div class="task-body"><label class="field-label" for="${type}-${i}">${rich(q)}</label><textarea class="text-area ${type==='drill'?'short-answer':''}" id="${type}-${i}" data-save="answer" data-key="${type}-${i}" rows="${type==='drill'?2:3}" placeholder="Write your answer in English…" maxlength="10000">${esc(st.answers[`${type}-${i}`]||'')}</textarea></div></div>`).join('')}</div>`;}
function answers(items,label='Compare with the answers') {return `<details class="answer-panel"><summary>${icon('check')}<span>${label}</span></summary><div class="answer-body"><p class="muted">Try the task first. Your wording can differ while preserving the meaning.</p>${items.map((v,i)=>`<p class="answer-item"><strong>${i+1}.</strong> ${rich(v)}</p>`).join('')}</div></details>`;}
function chunkCard(c,key) {const saved=Store.getState().phrases[key]?.saved;return `<article class="chunk-card"><div><p class="chunk-en">${esc(c.en)}</p><p class="chunk-hy" lang="hy">${esc(c.hy)}</p></div><div class="chunk-actions"><button class="icon-btn" data-action="speak" data-text="${esc(c.en)}" aria-label="Hear: ${esc(c.en)}">${icon('volume')}</button><button class="icon-btn ${saved?'is-saved':''}" data-action="save-phrase" data-key="${key}" aria-label="${saved?'Unsave':'Save'} phrase" aria-pressed="${!!saved}">${icon('bookmark')}</button></div></article>`;}
function dailyChunks(d) {return `<section class="phrase-section"><h3>Words you can use today</h3><p class="muted">Say each phrase, then make it about your own life.</p><div class="chunk-grid">${d.chunks.map((c,i)=>chunkCard(c,`${d.day}-${i}`)).join('')}</div></section>`;}

function lessonContent(d,step) {
  const film=course.extras.movies.find(m=>m.day===d.day), st=Store.dayState(d.day);
  if(step==='recall')return `<div class="panel-heading"><span class="eyebrow">START WITH YOUR OWN WORDS</span><h2>Bring yesterday into today.</h2><p lang="hy">${rich(d.retrieval_hy)}</p></div>${[1,7,14,21,30].includes(d.day)?`<div class="callout">${icon('mic')}<div><strong>This is a checkpoint day.</strong><p>Make your first attempt before studying today’s material. Keep it so you can compare your progress.</p><button class="text-link" data-action="baseline">Open the voice recorder</button></div></div>`:''}<div class="recall-prompt"><span class="eyebrow">A SIMPLE START</span><p>“Let me tell you about…”</p><span>Speak first. You can improve the sentence afterwards.</span></div><label class="field-label" for="lesson-notes">Your keywords, ideas, and useful corrections</label><textarea class="text-area" id="lesson-notes" data-save="notes" rows="5" placeholder="A few keywords are enough. Avoid writing your whole speech.">${esc(st.notes)}</textarea><p class="save-hint">Notes save automatically on this device.</p>`;
  if(step==='listen')return `<div class="panel-heading"><span class="eyebrow">LISTEN FOR MEANING</span><h2>Hear it. Understand it. Say it.</h2><p>Listen once without the transcript. Try the questions, then listen again and check the text.</p></div>${resourceCard(d.primary,d.primary_scope_hy)}${taskInputs(d,'input',d.input_tasks)}${answers(d.input_answers)}${film?`<div class="callout">${icon('film')}<div><strong>A different scene for today</strong><p>You can replace this 20-minute block with the ${esc(film.title)} film activity.</p><button class="text-link" data-action="film" data-day="${film.day}">Open film activity</button></div></div>`:''}`;
  if(step==='language')return `<div class="panel-heading"><span class="eyebrow">USEFUL LANGUAGE, MADE PERSONAL</span><h2>Build sentences that work.</h2><p lang="hy">${rich(d.drill.instruction_hy)}</p></div>${resourceCard(d.support,d.support_scope_hy)}${taskInputs(d,'drill',d.drill.items)}${answers(d.drill.answers,'Reveal the model sentences')}${dailyChunks(d)}`;
  if(step==='conversation')return `<div class="panel-heading"><span class="eyebrow">THIS IS YOUR SPEAKING TIME</span><h2>Let’s have a real conversation.</h2><p lang="hy">${rich(d.roleplay_hy)}</p></div>${d.scenario_en?`<div class="scenario-card"><span class="eyebrow">YOUR SITUATION</span><p>${esc(d.scenario_en)}</p></div>`:''}<h3>Start here. Then ask something new.</h3><ol class="conversation-questions">${d.questions.map(q=>`<li>${esc(q)}</li>`).join('')}</ol><div class="callout">${icon('chat')}<div><strong>Let your partner follow your answers.</strong><p>Ask “Why?” or “Can you give an example?” Keep most of the speaking time for you.</p><button class="text-link" data-action="coach">Copy the conversation coach instructions</button></div></div>${d.partner_only?`<details class="answer-panel partner-panel"><summary>${icon('lock')}<span>Partner only: unseen assessment cards</span></summary><div class="answer-body"><p class="muted">Let your partner read these privately. If you have already seen a card, ask for a comparable new situation.</p>${d.partner_only.map((c,i)=>`<p><strong>Card ${i+1}</strong><br>${esc(c)}</p>`).join('')}</div></details>`:''}<div class="conversation-rhythm"><h3>Your 45-minute rhythm</h3><p>${d.day===30?'Follow the special assessment order above.':'5 min warm-up · 12 min conversation · 5 min feedback · 12 min switch roles · 8 min new questions · 3 min recap'}</p></div>`;
  if(step==='transfer')return `<div class="panel-heading"><span class="eyebrow">SAME SKILL, NEW SITUATION</span><h2>Make it work somewhere new.</h2><p lang="hy">${rich(d.transfer_hy)}</p></div><div class="transfer-stages"><article><span>01</span><h3>Say it again</h3><p>Use two corrections from your conversation. Keep the meaning, improve the sentence.</p></article><article><span>02</span><h3>Change the situation</h3><p>Try a new person, a different deadline, or an unexpected detail.</p></article><article><span>03</span><h3>Respond without a script</h3><p>Answer follow-up questions in your own words. Ask for clarification when you need it.</p></article></div>${dailyChunks(d)}`;
  return `<div class="panel-heading"><span class="eyebrow">LEAVE A LITTLE EVIDENCE</span><h2>Hear your progress.</h2><p lang="hy">${rich(d.recording_hy)}</p></div>${recorderMarkup()}<h3>What changed today?</h3><label class="field-label" for="reflection">One improvement. One thing to practise next.</label><textarea class="text-area" id="reflection" data-save="reflection" rows="4" placeholder="Today I could… Next time I want to…">${esc(st.reflection)}</textarea><label class="field-label" for="speaking-minutes">Your actual speaking time today, in minutes</label><input class="text-input minutes-input" type="number" min="0" max="10000" step="1" id="speaking-minutes" data-save="minutes" value="${st.minutes||''}" placeholder="e.g. 45"><p class="save-hint">Count your voice, not listening or your partner’s speaking time.</p>${[1,7,14,21,30].includes(d.day)?assessmentForm(d.day):''}`;
}

function recorderMarkup() {return `<section class="recorder-card"><div class="section-head"><h3>${icon('mic')}Your voice journal</h3><span class="badge">DEVICE ONLY</span></div><div class="recording-controls"><button class="btn ${audio.active?'btn-danger':'btn-primary'}" data-action="record" id="record-button">${icon(audio.active?'stop':'mic')}${audio.active?'Stop recording':'Record my voice'}</button><span id="recording-clock" class="recording-clock" aria-live="off">${formatTime(audio.elapsedSeconds||0)}</span></div><p id="recorder-status" class="muted" role="status">${esc(recorderStatus||'Recordings stay in this browser. Download important clips to keep a separate copy.')}</p><div id="recordings-list"><p class="muted">Loading your recordings…</p></div></section>`;}
function assessmentForm(n) {const scores=Store.dayState(n).scores;return `<section class="assessment-box"><h3>Checkpoint ${num(n)}</h3><p class="muted">0: not yet · 1: substantial help · 2: a little help · 3: independently</p><div class="assessment-grid">${[['Clarity','Can the listener understand your main idea?'],['Task completion','Did you communicate the necessary information?'],['Independence','Did you speak without reading a full script?'],['Interaction','Did you answer, ask, and clarify?']].map(([label,desc],i)=>`<label class="score-field"><strong>${label}</strong><span>${desc}</span><select class="score-select" data-score="${i}" aria-label="${label} score">${[0,1,2,3].map(v=>`<option value="${v}" ${Number(scores[i])===v?'selected':''}>${v} / 3</option>`).join('')}</select></label>`).join('')}</div><p class="save-hint">A personal practice score, not a CEFR examination.</p></section>`;}

function lessonPage() {
  const d=lesson(route.day), order=phaseOrder(d.day), phase=order.find(p=>p.id===route.step), done=Store.dayState(d.day).steps;
  const diff=Store.getState().settings.difficulty;
  return `<header class="lesson-header"><a class="text-link" href="#/course">All 30 days</a><div class="lesson-title-row"><div><span class="eyebrow">DAY ${num(d.day)} · CHAPTER ${d.week}</span><h1>${esc(d.title_en)}</h1><p lang="hy">${esc(d.title_hy)}</p></div><span class="lesson-day-art" aria-hidden="true">${num(d.day)}</span></div><p class="lesson-goal" lang="hy">${rich(d.goal_hy)}</p></header><nav class="lesson-stepper" aria-label="Lesson blocks">${order.map(p=>`<a class="step-tab ${route.step===p.id?'active':''} ${done.includes(p.id)?'done':''}" href="${lessonURL(d.day,p.id)}" ${route.step===p.id?'aria-current="step"':''}><span class="step-icon">${icon(done.includes(p.id)?'check':p.icon)}</span><span class="step-label">${p.id==='language'?'Language':p.id==='conversation'?'Conversation':p.id==='transfer'?'Try again':p.id==='record'?'Record':p.name}</span><span class="step-time">${p.minutes} min</span></a>`).join('')}</nav><div class="lesson-layout"><div class="lesson-main"><section class="lesson-panel" id="lesson-panel">${lessonContent(d,phase.id)}</section><footer class="lesson-footer"><button class="btn btn-secondary" data-action="toggle-step">${icon(done.includes(phase.id)?'reset':'check')}${done.includes(phase.id)?'Mark unfinished':'Mark block done'}</button><button class="btn btn-primary" data-action="complete-step">${done.includes(phase.id)?'Continue':'Complete & continue'}${icon('check')}</button></footer></div><aside class="lesson-aside"><section class="timer-card"><span class="eyebrow">MAKE ROOM FOR PRACTICE</span><h3>${phase.name}</h3><div class="timer-display" id="timer-display" aria-live="off">${formatTime(timerSeconds())}</div><div class="timer-controls"><button class="btn btn-primary" data-action="timer" id="timer-toggle">${icon(timer.end?'pause':'play')}${timer.end?'Pause':'Start timer'}</button><button class="icon-btn" data-action="timer-reset" aria-label="Reset block timer">${icon('reset')}</button></div><p class="muted">A guide, not a deadline. Pause whenever you need.</p></section><section class="difficulty-card"><span class="eyebrow">MEET YOURSELF WHERE YOU ARE</span><h3>Choose your stretch</h3><div class="segmented" role="group" aria-label="Practice difficulty">${[['easier','Easier'],['standard','Standard'],['harder','Stretch']].map(([k,label])=>`<button class="${diff===k?'active':''}" data-action="difficulty" data-value="${k}" aria-pressed="${diff===k}">${label}</button>`).join('')}</div><p lang="hy" id="difficulty-text">${esc(diff==='easier'?d.easier_hy:diff==='harder'?d.harder_hy:'Հետևիր հիմնական առաջադրանքին։ Խոսիր քո բառերով և անհրաժեշտության դեպքում պարզաբանում խնդրիր։')}</p></section><section class="note-card"><span class="eyebrow">TODAY’S CHECKLIST</span><div class="checklist">${order.map(p=>`<a class="check-row ${done.includes(p.id)?'is-complete':''}" href="${lessonURL(d.day,p.id)}"><span class="check-box">${done.includes(p.id)?icon('check'):''}</span><span>${p.name}</span></a>`).join('')}</div><div class="progress-track"><div class="progress-fill" style="width:${done.length/6*100}%"></div></div><p class="muted">${done.length} of 6 blocks complete</p></section></aside></div>`;
}

function allPhrases() {return course.days.flatMap(d=>d.chunks.map((c,i)=>({...c,key:`${d.day}-${i}`,day:d.day,week:d.week})));}
function filteredPhrases() {const q=phraseSearch.toLowerCase();return allPhrases().filter(c=>(phraseFilter!=='saved'||Store.getState().phrases[c.key]?.saved)&&(phraseFilter!=='practice'||!Store.getState().phrases[c.key]?.known)&&`${c.en} ${c.hy}`.toLowerCase().includes(q));}
function phraseList() {const list=filteredPhrases();return list.length?`<p class="muted">${list.length} ${list.length===1?'phrase':'phrases'}${phraseFilter==='saved'?' saved by you':''}</p><div class="phrasebook-grid">${list.slice(0,phraseLimit).map(c=>`<div><span class="phrase-day">DAY ${num(c.day)}</span>${chunkCard(c,c.key)}</div>`).join('')}</div>${list.length>phraseLimit?'<div class="load-more"><button class="btn btn-secondary" data-action="more-phrases">Show more phrases</button></div>':''}`:'<div class="empty-state"><h3>Your collection starts with one phrase.</h3><p>Tap the bookmark beside a phrase to save it here, or choose All phrases.</p></div>';}
function flashCard() {const all=filteredPhrases(),list=all.length?all:allPhrases(),p=list[flashIndex%list.length];return `<article class="phrase-flashcard"><div class="flashcard-top"><span class="eyebrow">A MOMENT OF RECALL</span><span class="badge">DAY ${num(p.day)}</span></div><p class="flashcard-en">${esc(p.en)}</p><div class="flashcard-meaning">${flashShown?`<p lang="hy">${esc(p.hy)}</p><span>Now use it in one sentence about yourself.</span>`:'<p>Can you explain this in your own words?</p>'}</div><div class="flashcard-actions"><button class="btn btn-secondary" data-action="speak" data-text="${esc(p.en)}">${icon('volume')}Listen</button>${flashShown?`<button class="btn btn-ghost" data-action="flash-rate" data-key="${p.key}" data-known="false">Practise again</button><button class="btn btn-primary" data-action="flash-rate" data-key="${p.key}" data-known="true">I know this</button>`:'<button class="btn btn-primary" data-action="flash-reveal">Show the meaning</button>'}</div></article>`;}
function phrasesPage() {return `<div class="page-heading"><span class="eyebrow">SMALL PHRASES, REAL POSSIBILITIES</span><h1>Keep the words you’ll actually use.</h1><p>149 expressions from your course. Hear them, make them personal, and save your favourites.</p></div><div id="flashcard">${flashCard()}</div><div class="filter-row"><div class="view-tabs" role="group" aria-label="Filter phrases">${[['all','All phrases'],['saved','Saved'],['practice','Still practising']].map(([k,v])=>`<button class="tab ${phraseFilter===k?'active':''}" data-action="phrase-filter" data-value="${k}" aria-pressed="${phraseFilter===k}">${v}</button>`).join('')}</div><label class="search-box">${icon('search')}<input id="phrase-search" type="search" placeholder="Find your words" aria-label="Search phrases" value="${esc(phraseSearch)}"></label></div><div id="phrase-results">${phraseList()}</div>`;}

function filmsPage() {return `<div class="page-heading"><span class="eyebrow">YOUR ENGLISH, IN A DIFFERENT SCENE</span><h1>Press play. Then have your say.</h1><p>Four stories. Four chances to practise. Short, active sessions you can fit into your day.</p></div><div class="cinema-intro"><span class="cinema-symbol">${icon('film')}</span><div><h2>20 minutes is all you need.</h2><p>Watch a short segment. Explain what happened. Use its ideas in a new conversation.</p></div><button class="btn btn-secondary" data-action="film-method">The viewing method</button></div><div class="film-grid">${course.extras.movies.map((m,i)=>`<article class="film-card"><div class="film-poster film-${i+1}"><span class="poster-top">YOUR CINEMA SESSION · ${num(i+1)}</span><span class="poster-symbol" aria-hidden="true">${['✳','≈','✦','◎'][i]}</span><h2>${esc(m.title)}</h2><span class="poster-bottom">${m.year} <span>DAY ${num(m.day)}</span></span></div><div class="film-info"><span class="eyebrow">20-MINUTE OPTIONAL ACTIVITY</span><p lang="hy">${esc(m.purpose_hy)}</p><button class="btn btn-primary" data-action="film" data-day="${m.day}">${icon('play')}Open film activity</button></div></article>`).join('')}</div><p class="film-footnote">Official trailers and viewing pages are linked in each activity. Full films may require a subscription or rental; availability and subtitles vary by region.</p>`;}

function progressPage() {
  const s=Store.stats(), st=Store.getState();
  return `<div class="page-heading"><span class="eyebrow">PROGRESS YOU CAN HEAR</span><h1>Every conversation counts.</h1><p>Follow your practice. Compare your recordings. Notice what feels easier.</p></div><div class="stats-grid">${[[s.completed,'Days completed','calendar'],[s.blocks,'Practice blocks','check'],[s.minutes,'Minutes you spoke','mic'],[s.known,'Phrases you know','chat']].map(([n,label,i])=>`<article class="stat-card">${icon(i)}<strong>${n}</strong><span>${label}</span></article>`).join('')}</div><div class="progress-grid"><section class="card card-pad"><div class="section-head"><div><span class="eyebrow">YOUR COURSE MAP</span><h2>Small steps add up.</h2></div><strong>${s.percent}%</strong></div><div class="progress-track"><div class="progress-fill" style="width:${s.percent}%"></div></div><div class="heatmap">${course.days.map(d=>{const count=Store.dayState(d.day).steps.length;return `<a class="heatmap-cell ${count===6?'done':count?'started':''}" href="${lessonURL(d.day)}" aria-label="Day ${d.day}, ${count} of 6 blocks complete"><span>${num(d.day)}</span>${count===6?icon('check'):`<small>${count}/6</small>`}</a>`;}).join('')}</div><p class="muted">Days are complete when all six practice blocks are checked off.</p></section><section class="card card-pad"><span class="eyebrow">YOUR CHECKPOINTS</span><h2>Hear the difference.</h2><p class="muted">Compare similar tasks, with the same preparation time. The goal is clearer communication.</p><div class="checkpoint-list">${[1,7,14,21,30].map(n=>{const day=Store.dayState(n),score=day.scores.reduce((a,b)=>a+b,0);return `<a class="checkpoint-row" href="${lessonURL(n,'record')}"><span>Day ${num(n)}</span><span class="checkpoint-bar"><span style="width:${score/12*100}%"></span></span><strong>${score}/12</strong></a>`;}).join('')}</div><p class="save-hint">These are your own practice scores, not a formal language-level assessment.</p></section></div><section class="card card-pad journal-section"><div class="section-head"><div><span class="eyebrow">YOUR LEARNING JOURNAL</span><h2>Keep what you’re learning.</h2></div><button class="btn btn-secondary btn-small" data-action="export">${icon('download')}Export progress</button></div>${Object.entries(st.days).filter(([,d])=>d.reflection||d.notes).length?Object.entries(st.days).filter(([,d])=>d.reflection||d.notes).map(([n,d])=>`<details class="journal-entry"><summary>Day ${num(n)} · ${esc(lesson(Number(n)).title_en)}</summary>${d.notes?`<h3>Notes</h3><p>${esc(d.notes).replace(/\n/g,'<br>')}</p>`:''}${d.reflection?`<h3>Reflection</h3><p>${esc(d.reflection).replace(/\n/g,'<br>')}</p>`:''}<a class="text-link" href="${lessonURL(n,'record')}">Open this day’s recordings</a></details>`).join(''):'<div class="empty-state"><h3>Your story is still being written.</h3><p>Notes and reflections from your lessons will appear here.</p><a class="btn btn-primary" href="'+lessonURL(activeDay())+'">Start practising</a></div>'}<p class="save-hint">Progress and recordings stay in this browser. Export notes and progress to move them to another device; download recordings separately.</p></section>`;
}

function parseRoute() {
  const raw=location.hash.replace(/^#/,'')||'/home';
  const match=raw.match(/^\/lesson\/(\d+)\/(\w+)\/?$/);
  if(match&&Number(match[1])>=1&&Number(match[1])<=30&&phases.some(p=>p.id===match[2]))return {view:'lesson',day:Number(match[1]),step:match[2]};
  const view=raw.split('?')[0].replace('/','');
  if(view==='course'){const w=Number(new URLSearchParams(raw.split('?')[1]||'').get('week'));courseWeek=Number.isInteger(w)&&w>=1&&w<=4?w:0;}
  return {view:['home','course','phrases','films','progress'].includes(view)?view:'home'};
}
function render() {
  if(!course)return;
  route=parseRoute();
  if(route.view==='lesson'){
    safeSave(Store.setLast(route.day,route.step));
    const key=`${route.day}-${route.step}`;
    if(timer.key!==key){timer={key,remaining:phases.find(p=>p.id===route.step).minutes*60,end:null};}
  }else if(timer.end){timer.remaining=timerSeconds();timer.end=null;}
  const content=route.view==='home'?dashboard():route.view==='course'?coursePage():route.view==='lesson'?lessonPage():route.view==='phrases'?phrasesPage():route.view==='films'?filmsPage():progressPage();
  if(!$('#modal-root .recorder-card'))releaseRecorderUrls();
  $('#app').innerHTML=shell(content);
  document.title=`${route.view==='lesson'?`Day ${num(route.day)} · ${lesson(route.day).title_en}`:names[route.view]} — Fluent /30`;
  if(route.view==='lesson'&&route.step==='record')refreshRecorder();
  if(route.view==='lesson')$('.step-tab.active')?.scrollIntoView({block:'nearest',inline:'center',behavior:'instant'});
}
function formatTime(sec) {sec=Math.max(0,Math.floor(sec));return `${num(Math.floor(sec/60))}:${num(sec%60)}`;}
function timerSeconds() {return timer.end?Math.max(0,Math.ceil((timer.end-Date.now())/1000)):timer.remaining;}
function updateClock() {
  const time=timerSeconds();const el=$('#timer-display');if(el)el.textContent=formatTime(time);
  if(timer.end&&time===0){timer.end=null;timer.remaining=0;notify('Your practice block is complete. Take a breath, then continue.');const b=$('#timer-toggle');if(b)b.innerHTML=icon('play')+'Start timer';}
  const rec=$('#recording-clock');if(rec)rec.textContent=formatTime(audio.elapsedSeconds||0);
}
setInterval(updateClock,250);

function openModal(title,body) {
  if(!$('.modal'))modalReturnFocus=document.activeElement;
  if($('#modal-root .recorder-card')){stopModalRecorder();releaseRecorderUrls();}
  $('#modal-root').innerHTML=`<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1"><header class="modal-head"><h2 id="modal-title">${esc(title)}</h2><button class="icon-btn modal-close" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button></header><div class="modal-body">${body}</div></section></div>`;
  document.body.classList.add('modal-open');$('#app').inert=true;const skip=$('.skip-link');if(skip)skip.inert=true;$('.modal-close').focus();
}
function stopModalRecorder() {
  // stop() cancels a pending permission request immediately and releases active
  // microphone tracks before its promise waits for audio storage to finish.
  if(audio.active)void audio.stop().catch(()=>notify('Your recording could not be saved. Try recording again.'));
}
function closeModal() {
  if(!$('.modal'))return;
  if($('#modal-root .recorder-card')){stopModalRecorder();releaseRecorderUrls();}
  $('#modal-root').innerHTML='';document.body.classList.remove('modal-open');$('#app').inert=false;
  const skip=$('.skip-link');if(skip)skip.inert=false;
  const target=modalReturnFocus?.isConnected?modalReturnFocus:$('#main-content');
  modalReturnFocus=null;pendingImport=null;target?.focus({preventScroll:true});
}
function showGuide() {
  openModal('Your 30-day speaking practice',`<p class="intro-text">Two hours a day, built around speaking. Start with Day 1 and keep your first recording.</p>${course.extras.guide.map(g=>`<section class="guide-section"><h3 lang="hy">${esc(g.title)}</h3>${g.paragraphs.map(t=>`<p lang="hy">${rich(t)}</p>`).join('')}${g.closing?`<p lang="hy">${rich(g.closing)}</p>`:''}</section>`).join('')}<div class="download-row"><a class="btn btn-primary" href="./workbook.pdf" target="_blank" rel="noopener">${icon('download')}Read the full workbook</a><a class="btn btn-secondary" href="./workbook.docx" download>${icon('download')}Editable Word copy</a></div><p class="muted">A month of focused practice can help you communicate more confidently. Progress depends on your starting point and practice; this course does not promise a particular CEFR level.</p>`);
}
function showSettings() {
  openModal('Make this studio yours',`<section class="settings-section"><h3>Your progress stays with you.</h3><p>Lessons, written answers, notes, saved phrases and scores are stored in this browser. Recordings are also kept on this device. There is no account or automatic cross-device sync.</p><p class="muted">Clearing browser data can remove your work. Export your progress and download recordings you want to keep.</p><div class="settings-actions"><button class="btn btn-primary" data-action="export">${icon('download')}Export progress</button><button class="btn btn-secondary" data-action="import">${icon('upload')}Import progress</button></div><p class="save-hint">Backups include notes and scores. Audio files must be downloaded separately.</p></section><section class="settings-section"><h3>Take your course with you.</h3><p>After your first visit, the course pages can open offline. Linked lessons and films need an internet connection.</p><p>To keep the website on your iPhone, use your browser’s Share menu and choose Add to Home Screen when available.</p><div class="download-row"><a class="btn btn-secondary" href="./workbook.pdf" target="_blank" rel="noopener">${icon('download')}Complete PDF</a><a class="btn btn-secondary" href="./workbook.docx" download>${icon('download')}Word workbook</a></div></section><section class="settings-section"><h3>A fresh start</h3><p>Reset lesson checkmarks, written answers, saved phrases and scores on this device. Voice recordings are kept separately.</p><button class="btn btn-ghost" data-action="reset-confirm">Reset my progress</button></section>`);
}
function filmModal(day) {
  const m=course.extras.movies.find(m=>m.day===day);if(!m)return;
  openModal(`${m.title} · Day ${num(day)}`,`<span class="badge">20-MINUTE OPTIONAL SESSION</span><p lang="hy">${esc(m.purpose_hy)}</p><p lang="hy">${esc(m.level_hy)}</p><div class="download-row">${external(m.trailer.url,icon('play')+'Official trailer','btn btn-primary')}${external(m.full.url,icon('film')+'Official film page')}</div><p class="muted">Trailers and full films are different links. Full-film access may require payment and can vary by region.</p><h3>Watch a 30–60 second segment</h3><ol class="conversation-questions">${m.prompts.map(q=>`<li>${esc(q)}</li>`).join('')}</ol><h3>Your speaking task</h3><p lang="hy">${esc(m.task_hy)}</p><h3>Your recording</h3><p lang="hy">${esc(m.output_hy)}</p><h3>Change one condition</h3><p lang="hy">${esc(m.stretch_hy)}</p><div class="callout"><p>This can replace the 20-minute listening block for Day ${day}. Keep the other practice blocks in your day.</p></div><a class="btn btn-primary" href="${lessonURL(day,'record')}" data-close-modal>Open Day ${day} voice journal</a>`);
}
function exportProgress() {downloadBlob(new Blob([JSON.stringify(Store.getState(),null,2)],{type:'application/json'}),`fluent30-progress-${new Date().toISOString().slice(0,10)}.json`);notify('Your progress backup is ready. Recordings are downloaded separately.');}
function downloadBlob(blob,name) {const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
async function copyText(text) {try{await navigator.clipboard.writeText(text);notify('Copied. Paste this into your conversation with a partner.');}catch{openModal('Conversation coach instructions',`<p>Select and copy these instructions.</p><textarea class="text-area" readonly rows="12">${esc(text)}</textarea>`);}}
function speak(text) {
  if(!('speechSynthesis' in window)){notify('Speech playback is unavailable in this browser. Use the linked lesson audio.');return;}
  speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang='en-US';utterance.rate=.88;
  const voices=speechSynthesis.getVoices();utterance.voice=voices.find(v=>v.lang==='en-US'&&v.localService)||voices.find(v=>v.lang.startsWith('en'))||null;
  utterance.onerror=e=>{if(e.error!=='interrupted'&&e.error!=='canceled')notify('Speech playback is unavailable. Try the audio in the lesson link.');};
  speechSynthesis.speak(utterance);
}

function releaseRecorderUrls() {recorderRefresh++;audioUrls.forEach(u=>URL.revokeObjectURL(u));audioUrls=[];}
async function refreshRecorder() {
  const refresh=++recorderRefresh;
  const button=$('#record-button');if(button){button.innerHTML=icon(audio.active?'stop':'mic')+(audio.active?'Stop recording':'Record my voice');button.className='btn '+(audio.active?'btn-danger':'btn-primary');}
  const el=$('#recordings-list');if(!el)return;
  const day=route.day||Store.getState().lastDay;
  const records=await audio.list(day);
  if(!el.isConnected||refresh!==recorderRefresh)return;
  const html=[],urls=[];
  for(const r of records){const blob=await audio.getBlob(r.id);if(!el.isConnected||refresh!==recorderRefresh){urls.forEach(u=>URL.revokeObjectURL(u));return;}if(!blob)continue;const url=URL.createObjectURL(blob);urls.push(url);const date=new Date(r.createdAt);html.push(`<article class="recording-item"><div class="recording-meta"><strong>${esc(date.toLocaleDateString(undefined,{month:'short',day:'numeric'}))} · ${esc(date.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}))}</strong><span>${formatTime(r.duration||0)}</span></div>${r.storage==='session'?'<p class="save-hint"><strong>Session only.</strong> Download this clip before closing the tab.</p>':''}${r.interrupted?'<p class="save-hint"><strong>Interrupted — listen back.</strong> Check the captured audio before relying on this clip.</p>':''}<audio controls preload="metadata" src="${url}" aria-label="Your Day ${day} recording"></audio><div class="recording-actions"><button class="text-link" data-action="download-recording" data-id="${esc(r.id)}">${icon('download')}Download</button><button class="text-link" data-action="delete-recording" data-id="${esc(r.id)}">Delete</button></div></article>`);}
  if(el.isConnected&&refresh===recorderRefresh){audioUrls.forEach(u=>URL.revokeObjectURL(u));audioUrls=urls;el.innerHTML=html.join('')||`<p class="recording-empty">${records.length?'These recordings could not be loaded. Please try again.':'Your recordings for this day will appear here.'}</p>`;}else urls.forEach(u=>URL.revokeObjectURL(u));
}

document.addEventListener('click',async event=>{
  if(event.target.closest('a[href="#main-content"]')){event.preventDefault();const main=$('#main-content');main?.focus({preventScroll:true});main?.scrollIntoView({block:'start'});return;}
  const button=event.target.closest('[data-action]');
  if(event.target.matches('.modal-backdrop')){closeModal();return;}
  if(event.target.closest('[data-close-modal]'))closeModal();
  if(!button)return;
  const action=button.dataset.action;
  if(action==='guide')showGuide();
  else if(action==='settings')showSettings();
  else if(action==='close-modal')closeModal();
  else if(action==='week'){courseWeek=Number(button.dataset.week);history.replaceState(null,'',`#/course${courseWeek?'?week='+courseWeek:''}`);render();}
  else if(action==='speak')speak(button.dataset.text);
  else if(action==='save-phrase'){const key=button.dataset.key,saved=!Store.getState().phrases[key]?.saved;const persisted=Store.setPhrase(key,{saved});button.classList.toggle('is-saved',saved);button.setAttribute('aria-pressed',String(saved));button.setAttribute('aria-label',saved?'Unsave phrase':'Save phrase');if(safeSave(persisted))notify(saved?'Saved to your phrasebook.':'Phrase removed from your saved collection.');if(route.view==='phrases'&&phraseFilter==='saved')$('#phrase-results').innerHTML=phraseList();}
  else if(action==='difficulty'){safeSave(Store.setDifficulty(button.dataset.value));render();}
  else if(action==='timer'){if(timer.end){timer.remaining=timerSeconds();timer.end=null;}else{if(timer.remaining===0)timer.remaining=phases.find(p=>p.id===route.step).minutes*60;timer.end=Date.now()+timer.remaining*1000;}button.innerHTML=icon(timer.end?'pause':'play')+(timer.end?'Pause':'Start timer');updateClock();}
  else if(action==='timer-reset'){timer.remaining=phases.find(p=>p.id===route.step).minutes*60;timer.end=null;$('#timer-toggle').innerHTML=icon('play')+'Start timer';updateClock();}
  else if(action==='toggle-step'){const done=Store.dayState(route.day).steps.includes(route.step),persisted=Store.setStep(route.day,route.step,!done);render();if(safeSave(persisted))notify(done?'Block marked unfinished.':'Practice block complete.');}
  else if(action==='complete-step'){
    if(audio.active){notify('Stop your recording before continuing.');return;}
    const n=route.day,order=phaseOrder(n),i=order.findIndex(p=>p.id===route.step);safeSave(Store.setStep(n,route.step));
    if(i<order.length-1)location.hash=lessonURL(n,order[i+1].id);else{const complete=Store.dayState(n).steps.length===6;openModal(complete?'A little more confident.':'Your recording block is complete.',complete?`<div class="completion-art">${icon('check')}</div><p>You completed Day ${n}. You showed up, practised, and gave your English a little more room.</p><div class="download-row"><a class="btn btn-primary" data-close-modal href="${n<30?lessonURL(n+1,'recall'):'#/progress'}">${n<30?'Explore Day '+(n+1):'See my progress'}</a><a class="btn btn-secondary" data-close-modal href="#/progress">View progress</a></div>`:`<p>You still have ${6-Store.dayState(n).steps.length} practice blocks to finish in this day.</p><a class="btn btn-primary" data-close-modal href="${lessonURL(n)}">Continue remaining blocks</a>`);render();}
  }
  else if(action==='coach')copyText(course.extras.guide[1].coach);
  else if(action==='film')filmModal(Number(button.dataset.day));
  else if(action==='film-method')openModal('A film session that makes you speak',course.extras.movie_method.map(t=>`<p lang="hy">${rich(t)}</p>`).join(''));
  else if(action==='phrase-filter'){phraseFilter=button.dataset.value;phraseLimit=24;flashIndex=0;flashShown=false;render();}
  else if(action==='flash-reveal'){flashShown=true;$('#flashcard').innerHTML=flashCard();}
  else if(action==='flash-rate'){safeSave(Store.setPhrase(button.dataset.key,{known:button.dataset.known==='true'}));flashIndex++;flashShown=false;$('#flashcard').innerHTML=flashCard();if(phraseFilter==='practice')$('#phrase-results').innerHTML=phraseList();}
  else if(action==='more-phrases'){phraseLimit+=24;$('#phrase-results').innerHTML=phraseList();}
  else if(action==='baseline'){openModal('Record your first attempt',`<p>Speak before studying today’s lesson. Keep this first recording even if it feels imperfect.</p>${recorderMarkup()}`);refreshRecorder();}
  else if(action==='record'){
    button.disabled=true;
    try{if(audio.active)await audio.stop();else await audio.start(route.day||Store.getState().lastDay);}catch{notify('The microphone could not be started. Check your browser permission and try again.');}
    button.disabled=false;refreshRecorder();
  }
  else if(action==='download-recording'){const blob=await audio.getBlob(button.dataset.id);if(blob)downloadBlob(blob,`fluent30-day-${num(route.day||Store.getState().lastDay)}-${button.dataset.id}.${blob.type.includes('mp4')?'m4a':blob.type.includes('ogg')?'ogg':'webm'}`);else notify('This recording could not be loaded for download. Please try again.');}
  else if(action==='delete-recording')openModal('Delete this recording?',`<p>This removes the clip from this browser. Download a copy first if you want to keep it.</p><button class="btn btn-danger" data-action="confirm-delete-recording" data-id="${esc(button.dataset.id)}">Delete recording</button>`);
  else if(action==='confirm-delete-recording'){const removed=await audio.remove(button.dataset.id);if(removed){closeModal();refreshRecorder();notify('Recording deleted.');}else notify('The recording could not be deleted. Please try again.');}
  else if(action==='export')exportProgress();
  else if(action==='import'){$('#backup-file').value='';$('#backup-file').click();}
  else if(action==='confirm-import'){if(pendingImport){const persisted=Store.replaceState(pendingImport);pendingImport=null;closeModal();render();if(safeSave(persisted))notify('Your progress has been restored.');}}
  else if(action==='reset-confirm')openModal('Reset your course progress?',`<p>This clears lesson checkmarks, answers, notes, saved phrases and scores on this device. Recordings are kept separately.</p><p>Export your progress first if you might want it later.</p><div class="download-row"><button class="btn btn-secondary" data-action="export">Export a backup</button><button class="btn btn-danger" data-action="reset-progress">Reset progress</button></div>`);
  else if(action==='reset-progress'){const persisted=Store.resetState();closeModal();render();safeSave(persisted);notify(persisted?'Your course progress has been reset.':'Progress was reset for this tab only. Browser storage could not be updated.');}
});

document.addEventListener('input',event=>{
  const el=event.target;
  if(el.id==='course-search'){courseSearch=el.value;$('#course-results').innerHTML=courseCards();return;}
  if(el.id==='phrase-search'){phraseSearch=el.value;phraseLimit=24;$('#phrase-results').innerHTML=phraseList();return;}
  if(route.view!=='lesson')return;
  if(el.dataset.save==='answer')safeSave(Store.setAnswer(route.day,el.dataset.key,el.value));
  else if(['notes','reflection'].includes(el.dataset.save))safeSave(Store.setDay(route.day,{[el.dataset.save]:el.value.slice(0,10000)}));
  else if(el.dataset.save==='minutes')safeSave(Store.setDay(route.day,{minutes:Math.min(10000,Math.max(0,Number(el.value)||0))}));
});
document.addEventListener('change',async event=>{
  const el=event.target;
  if(el.matches('[data-score]')&&route.view==='lesson'){const scores=[...Store.dayState(route.day).scores];scores[Number(el.dataset.score)]=Number(el.value);safeSave(Store.setDay(route.day,{scores}));}
  if(el.id==='backup-file'&&el.files?.[0]){
    try{if(el.files[0].size>3e6)throw new Error('This file is too large for a progress backup.');pendingImport=Store.validateState(JSON.parse(await el.files[0].text()));openModal('Restore this progress backup?',`<p>This will replace the written progress on this device with the backup you selected. Recordings are not affected.</p><p>${Object.values(pendingImport.days).filter(d=>d.steps.length===6).length} completed days in this backup.</p><div class="download-row"><button class="btn btn-secondary" data-action="export">Save my current progress first</button><button class="btn btn-primary" data-action="confirm-import">Restore backup</button></div>`);}catch(error){notify(error.message||'This backup could not be read.');}
  }
});
document.addEventListener('keydown',event=>{
  const modal=$('.modal');if(!modal)return;
  if(event.key==='Escape'){event.preventDefault();closeModal();return;}
  if(event.key==='Tab'){
    const focus=[...modal.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled):not([type="hidden"]),textarea:not(:disabled),select:not(:disabled),audio[controls],[tabindex]:not([tabindex="-1"])')].filter(el=>el.tabIndex>=0&&el.getClientRects().length&&!el.closest('[hidden], [inert]'));
    if(!focus.length){event.preventDefault();modal.focus();return;}
    const first=focus[0],last=focus.at(-1),outside=!modal.contains(document.activeElement)||document.activeElement===modal;
    if(event.shiftKey&&(document.activeElement===first||outside)){event.preventDefault();last.focus();}else if(!event.shiftKey&&(document.activeElement===last||outside)){event.preventDefault();first.focus();}
  }
});
window.addEventListener('hashchange',async()=>{if(audio.active)await audio.stop();closeModal();render();window.scrollTo({top:0,behavior:'instant'});$('#main-content')?.focus({preventScroll:true});});
window.addEventListener('beforeunload',event=>{if(audio.active){event.preventDefault();event.returnValue='';}});
window.addEventListener('online',()=>notify('You’re back online. External lessons are available.'));
window.addEventListener('offline',()=>notify('You’re offline. Your saved course still works; external lessons need internet.'));

async function init() {
  try {const response=await fetch('./course.json');if(!response.ok)throw new Error('Course request failed.');course=await response.json();if(!Array.isArray(course.days)||course.days.length!==30)throw new Error('The course is incomplete.');render();if(!Store.isPersistent())notify('Browser storage is unavailable. Export your work before leaving.');if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});}
  catch {$('#app').innerHTML='<main class="error-state"><span class="brand-mark">f.</span><h1>Let’s try that again.</h1><p>Your course could not load. Check your connection, then refresh the page.</p><button class="btn btn-primary" onclick="location.reload()">Reload course</button><a href="./workbook.pdf">Read the complete PDF instead</a></main>';}
}
init();
