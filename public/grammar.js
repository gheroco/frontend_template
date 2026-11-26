import * as Store from './store.js';
import { BookLibrary } from './books.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $ = (selector,root=document) => root.querySelector(selector);
const pad = n => String(n).padStart(2,'0');
const normal = value => String(value||'').trim().toLowerCase().replace(/[’‘]/g,"'").replace(/[.!?]+$/,'').replace(/\s+/g,' ');
const bookURL = (id,page=1) => '#/books/'+encodeURIComponent(id)+'/'+Math.max(1,Math.round(page));
const topicURL = id => '#/grammar/'+id;
const intro = '<p class="grammar-credit">Original Fluent /30 practice. Murphy’s books are available separately through Cambridge.</p>';
const external = (url,label) => '<a class="btn btn-secondary btn-small" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+'<span class="screen-reader-only"> (opens a new tab)</span></a>';
function highlight(text,query) {
  if(!query)return esc(text);
  const source=String(text),q=query.trim().toLowerCase();
  if(!q)return esc(source);
  let result='',start=0,index=0,limit=0;
  while((index=source.toLowerCase().indexOf(q,start))>=0&&limit++<150){
    result+=esc(source.slice(start,index))+'<mark>'+esc(source.slice(index,index+q.length))+'</mark>';start=index+q.length;
  }
  return result+esc(source.slice(start));
}
function download(blob,name) {
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}

export class GrammarStudio {
  constructor(host) {
    this.host=host;this.data=null;this.error='';this.library=new BookLibrary();this.bookList=[];
    this.level='all';this.query='';this.route={view:'grammar'};this.reader=null;this.readerMode='text';
    this.readerQuery='';this.fontSize=18;this.mountToken=0;this.renderAbort=null;
    this.importController=null;this.importStatus=null;this.importError='';this.notesDirty=false;
    this.noteDraft='';this.notePage=null;this.noteBook=null;this.noteSaving=null;
    document.addEventListener('click',event=>this.click(event).catch(error=>this.host.notify(error.message||'Please try again.')));
    document.addEventListener('input',event=>this.input(event));
    document.addEventListener('change',event=>this.change(event).catch(error=>this.host.notify(error.message||'Please try again.')));
    document.addEventListener('submit',event=>{if(event.target.id==='reader-page-form'){event.preventDefault();this.goToPage().catch(error=>this.host.notify(error.message));}});
    window.addEventListener('beforeunload',event=>{if(this.notesDirty||this.importController){event.preventDefault();event.returnValue='';}});
  }
  async load() {
    try {const response=await fetch('./grammar-content.json');if(!response.ok)throw new Error('Your grammar library could not load. Please try again.');const data=await response.json();if(data.lessons?.length!==12||!Array.isArray(data.books))throw new Error('The grammar library is incomplete.');this.data=data;this.error='';}
    catch(error){this.error=error.message;}
  }
  get icon(){return this.host.icon;}
  get subnav(){return '<nav class="course-subnav" aria-label="Study area"><a href="#/course">Daily course</a><a class="active" href="#/grammar" aria-current="page">Grammar & books</a></nav>';}
  recommendation(day) {
    if(!this.data)return '';
    const topics=this.data.lessons.filter(t=>t.related_days.includes(day)).slice(0,2);
    return '<aside class="grammar-day-callout">'+this.icon('book')+'<div><strong>Understand the grammar behind your words.</strong><p>Use one short explanation during this language block, then make your own sentences.</p><div class="grammar-inline-links">'+topics.map(t=>'<a class="text-link" href="'+topicURL(t.id)+'">'+esc(t.title)+'</a>').join('')+'<a class="text-link" href="#/grammar?tab=books">Read your own grammar book</a></div></div></aside>';
  }
  render(route) {
    this.route=route;
    if(route.view==='reader')return '<div id="grammar-route">'+(this.reader?.id===route.bookId?this.readerPage():'<div class="book-loading" role="status"><span class="brand-mark">f.</span><h1>Opening your book…</h1><p>Reading from this browser’s private storage.</p></div>')+'</div>';
    if(!this.data)return '<div id="grammar-route">'+this.subnav+'<section class="empty-state"><h1>Your grammar library</h1><p>'+esc(this.error||'Opening your grammar lessons…')+'</p><button class="btn btn-primary" data-action="g-retry">Try again</button></section></div>';
    if(route.topic)return '<div id="grammar-route">'+this.topicPage(route.topic)+'</div>';
    const selected=route.tab||'practice';
    const heading='<header class="grammar-heading"><div><span class="eyebrow">A LITTLE STRUCTURE. MORE FREEDOM.</span><h1>Make the rule part<br class="desktop-only"> of your voice.</h1><p>Practise a grammar point. Read your own books. Bring it into your next conversation.</p></div><div class="grammar-emblem" aria-hidden="true"><span>am</span><span>is</span><span>are</span><small>WORDS THAT WORK TOGETHER</small></div></header>';
    const tabs='<nav class="grammar-tabs" aria-label="Grammar library sections">'+[['practice','Practice'],['books','My books'],['editions','Murphy editions']].map(([id,label])=>'<a href="#/grammar'+(id==='practice'?'':'?tab='+id)+'" class="'+(selected===id?'active':'')+'" '+(selected===id?'aria-current="page"':'')+'>'+esc(label)+'</a>').join('')+'</nav>';
    return '<div id="grammar-route">'+this.subnav+heading+tabs+(selected==='books'?this.booksPage():selected==='editions'?this.editionsPage():this.practicePage())+'</div>';
  }
  async mount(route) {
    const token=++this.mountToken;
    this.renderAbort?.abort();this.renderAbort=null;
    if(route.view==='reader') {
      try {
        if(this.reader?.id!==route.bookId){const loaded=await this.library.get(route.bookId);if(token!==this.mountToken)return;this.reader=loaded;this.readerQuery='';this.readerMode='text';}
        if(token!==this.mountToken)return;
        const slot=$('#grammar-route');
        if(!this.reader){if(slot)slot.innerHTML=this.subnav+'<section class="empty-state"><h1>This book is not in this browser.</h1><p>Books are stored on the device where you import them. Choose your PDF here to read it.</p><a class="btn btn-primary" href="#/grammar?tab=books">Open my books</a></section>';return;}
        this.route={...route,page:Math.min(this.reader.pageCount,Math.max(1,route.page||this.reader.lastPage||1))};
        if(this.noteBook!==this.reader.id||this.notePage!==this.route.page){this.noteDraft=this.reader.notes[this.route.page]||'';this.notesDirty=false;this.noteBook=this.reader.id;this.notePage=this.route.page;}
        if(slot)slot.innerHTML=this.readerPage();
        const page=this.route.page;
        if(this.reader.lastPage!==page){this.reader.lastPage=page;await this.library.update(this.reader.id,{lastPage:page});}
        if(token!==this.mountToken)return;
        if(this.readerMode==='original')await this.drawOriginal(token);
      }catch(error){if(token===this.mountToken){const slot=$('#grammar-route');if(slot)slot.innerHTML=this.subnav+'<section class="empty-state"><h1>We couldn’t open this book.</h1><p>'+esc(error.message)+'</p><a class="btn btn-primary" href="#/grammar?tab=books">Back to my books</a></section>';}}
    } else if(route.view==='grammar'&&!route.topic&&route.tab==='books'){
      try{const listed=await this.library.list();if(token!==this.mountToken)return;this.bookList=listed;if($('#mybooks-list'))$('#mybooks-list').innerHTML=this.myBooks();}
      catch(error){if(token===this.mountToken&&$('#mybooks-list'))$('#mybooks-list').innerHTML='<p class="book-error" role="status">'+esc(error.message)+'</p>';}
    }
  }
  async leave(nextRoute) {
    this.mountToken++;this.renderAbort?.abort();
    if(this.notesDirty||this.noteSaving)await this.saveNote(false);
    if(this.route.view==='reader'&&nextRoute?.view!=='reader'&&!this.importController)await this.library.dispose();
    if(nextRoute)this.route=nextRoute;
  }
  practicePage() {
    const studied=Object.values(Store.getState().grammar||{}).filter(x=>x.practised).length;
    return '<div class="grammar-summary"><div><strong>'+studied+' / 12</strong><span>topics practised</span></div><div><strong>48</strong><span>short exercises</span></div><div><strong>10–15 min</strong><span>inside your language block</span></div></div>'+intro+'<div class="filter-row grammar-filter"><div class="view-tabs" role="group" aria-label="Grammar level">'+[['all','All levels'],['A1','A1'],['A2','A2'],['B1','B1']].map(([key,label])=>'<button class="tab '+(this.level===key?'active':'')+'" data-action="g-level" data-level="'+key+'" aria-pressed="'+(this.level===key)+'">'+label+'</button>').join('')+'</div><label class="search-box">'+this.icon('search')+'<input type="search" id="grammar-search" aria-label="Search grammar topics" placeholder="Find a grammar point" value="'+esc(this.query)+'"></label></div><div id="grammar-topic-results">'+this.topicCards()+'</div>';
  }
  topicCards() {
    const topics=this.data.lessons.filter(t=>(this.level==='all'||t.level===this.level)&&[t.title,t.summary_en,...t.book_keywords].join(' ').toLowerCase().includes(this.query.toLowerCase()));
    if(!topics.length)return '<div class="empty-state"><h2>No matching topics</h2><p>Try a shorter phrase or select All levels.</p></div>';
    return '<div class="grammar-topic-grid">'+topics.map(t=>{
      const p=Store.grammarState(t.id);
      return '<article class="grammar-topic-card"><div class="section-head"><span class="badge">'+esc(t.level)+' · '+esc(t.category)+'</span><button class="icon-btn '+(p.saved?'is-saved':'')+'" data-action="g-save-topic" data-topic="'+t.id+'" aria-label="'+(p.saved?'Unsave':'Save')+' '+esc(t.title)+'" aria-pressed="'+!!p.saved+'">'+this.icon('bookmark')+'</button></div><h2>'+esc(t.title)+'</h2><p>'+esc(t.summary_en)+'</p><div class="grammar-topic-bottom"><span class="'+(p.practised?'grammar-done':'muted')+'">'+(p.practised?this.icon('check')+'Practised':'4 short exercises')+'</span><a class="btn btn-primary btn-small" href="'+topicURL(t.id)+'">Open topic</a></div></article>';
    }).join('')+'</div>';
  }
  topicPage(id) {
    const t=this.data.lessons.find(x=>x.id===id);
    if(!t)return this.subnav+'<section class="empty-state"><h1>Choose a grammar topic.</h1><a href="#/grammar" class="btn btn-primary">All grammar topics</a></section>';
    const p=Store.grammarState(id);
    const exercise=(x,i)=>'<div class="grammar-exercise"><label for="grammar-answer-'+i+'"><span>'+pad(i+1)+'</span>'+esc(x.prompt)+'</label><input class="text-input" id="grammar-answer-'+i+'" data-grammar-answer="'+i+'" data-topic="'+id+'" value="'+esc(p.answers[i]||'')+'" placeholder="Missing word or words" autocomplete="off" maxlength="400"><div id="grammar-feedback-'+i+'" class="grammar-feedback">'+(p.checked?this.feedback(x,p.answers[i]):'')+'</div></div>';
    return this.subnav+'<header class="grammar-topic-heading"><a class="text-link" href="#/grammar">All grammar topics</a><div class="meta-row"><span class="badge">'+esc(t.level)+'</span><span>Original Fluent /30 lesson</span></div><h1>'+esc(t.title)+'</h1><p>'+esc(t.summary_en)+'</p></header><div class="grammar-lesson-layout"><div><section class="card grammar-rule"><span class="eyebrow">UNDERSTAND IT</span><h2>A pattern you can use.</h2><p lang="hy">'+esc(t.explanation_hy)+'</p><div class="grammar-pattern">'+esc(t.pattern)+'</div><div class="grammar-examples">'+t.examples.map(x=>'<article><div><p>'+esc(x.en)+'</p><span lang="hy">'+esc(x.hy)+'</span></div><button class="icon-btn" data-action="speak" data-text="'+esc(x.en)+'" aria-label="Hear: '+esc(x.en)+'">'+this.icon('volume')+'</button></article>').join('')+'</div></section><section class="grammar-correction"><span class="eyebrow">A SMALL CHANGE MAKES IT CLEAR</span><p class="grammar-incorrect"><span>Instead of</span><s>'+esc(t.common_mistake.incorrect)+'</s></p><p class="grammar-correct"><span>Say</span><strong>'+esc(t.common_mistake.correct)+'</strong></p><p lang="hy">'+esc(t.common_mistake.why_hy)+'</p></section><section class="card grammar-exercises"><span class="eyebrow">TRY IT YOURSELF</span><h2>Fill the gap. Say the sentence.</h2><p class="muted">Write only the missing word or words. Then read the whole sentence aloud.</p>'+t.exercises.map(exercise).join('')+'<div class="grammar-check-row"><button class="btn btn-primary" data-action="g-check" data-topic="'+id+'">Check my answers</button><span id="grammar-score" role="status">'+(p.checked?this.score(t,p):'')+'</span></div><details class="answer-panel"><summary>Show the answer key</summary><div class="answer-body">'+t.exercises.map((x,i)=>'<p><strong>'+pad(i+1)+'. '+esc(x.answer)+'</strong><br><span lang="hy">'+esc(x.explanation_hy)+'</span></p>').join('')+'</div></details></section></div><aside class="grammar-topic-aside"><section class="grammar-speaking"><span class="eyebrow">TURN IT INTO SPEECH</span><h2>Now make it yours.</h2><ol>'+t.speaking_prompts.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ol><p class="muted">Speak without reading a full script. Try again with a different detail.</p><button class="btn '+(p.practised?'btn-secondary':'btn-primary')+'" data-action="g-practised" data-topic="'+id+'">'+this.icon(p.practised?'reset':'check')+(p.practised?'Mark for more practice':'Mark topic practised')+'</button></section><section class="card grammar-connected"><h3>Use it in your course</h3><div>'+t.related_days.map(day=>'<a href="#/lesson/'+day+'/language">Day '+pad(day)+'</a>').join('')+'</div><h3>Find it in your book</h3><p>Look for these ideas in your edition’s contents or index:</p><p class="grammar-keywords">'+t.book_keywords.map(esc).join(' · ')+'</p><a class="btn btn-secondary" href="#/grammar?tab=books">Open my books</a><p class="save-hint">Unit numbers vary between editions. These are original course explanations, not extracted book units.</p></section></aside></div>';
  }
  correct(exercise,value){return [exercise.answer,...(exercise.alternatives||[])].some(x=>normal(x)===normal(value))&&!!normal(value);}
  feedback(exercise,value) {
    if(!normal(value))return '<p class="feedback-empty">Try this one before checking.</p>';
    return this.correct(exercise,value)?'<p class="feedback-correct">'+this.icon('check')+'That fits. Now say the whole sentence.</p>':'<p class="feedback-retry">Try again, or open the answer key for the explanation.</p>';
  }
  score(t,p){return t.exercises.filter((x,i)=>this.correct(x,p.answers[i])).length+' / '+t.exercises.length+' correct';}
  booksPage() {
    return '<section class="private-books-intro"><div><span class="eyebrow">YOUR COPY. YOUR READING SPACE.</span><h2>Bring a book into your practice.</h2><p>Import your own PDF to read searchable page text, keep notes, and return to where you stopped.</p><p class="book-privacy">'+this.icon('lock')+'Your file stays in this browser. It is never uploaded.</p><div class="book-import-actions"><button class="btn btn-primary" data-action="g-import" '+(this.importController?'disabled':'')+'>'+this.icon('upload')+'Choose my PDF</button><button class="btn btn-secondary" data-action="g-demo" '+(this.importController?'disabled':'')+'>Try the course workbook</button></div><input type="file" id="private-book-file" accept="application/pdf,.pdf" hidden><p class="save-hint">Readable PDF · up to 60 MB and 800 pages. Image-only scans can be viewed as original pages; text extraction requires selectable text. No OCR.</p></div><div class="private-book-art" aria-hidden="true"><span>My<br><em>books.</em></span>'+this.icon('bookmark')+'</div></section><div id="book-import-status">'+this.importMarkup()+'</div><section class="mybooks-section"><div class="section-head"><div><span class="eyebrow">SAVED ON THIS DEVICE</span><h2>Your bookshelf</h2></div><a class="text-link" href="#/grammar?tab=editions">Find official Murphy editions</a></div><div id="mybooks-list">'+this.myBooks()+'</div></section><details class="book-reader-help"><summary>What does the reader extract?</summary><p>It reads selectable page text and available PDF contents links. You can search the whole book, navigate by page, and switch to the original layout for diagrams, tables, or reading-order checks.</p><p>Extracted page text is not an automatically graded Murphy course. Scans, exercise numbering, answer-key links, and complex layouts may need manual review. Keep your original PDF: browser storage can be cleared, and books are separate from the course progress backup.</p><p>Cambridge online ebooks are accessed on the publisher’s platform. This reader does not download them or unlock protected files.</p></details>';
  }
  importMarkup() {
    if(this.importError)return '<div class="book-error" role="status">'+esc(this.importError)+'</div>';
    const p=this.importStatus;if(!p)return '';
    return '<div class="book-import-progress" role="status"><div><strong>'+esc(p.message||'Preparing your book…')+'</strong><span>'+Math.round(p.percent||0)+'%</span></div><progress max="100" value="'+(p.percent||0)+'" aria-label="Book import progress"></progress><button class="text-link" data-action="g-cancel-import">Cancel import</button></div>';
  }
  myBooks() {
    if(!this.bookList.length)return '<div class="bookshelf-empty">'+this.icon('book')+'<div><h3>Your first book starts here.</h3><p>Choose a PDF you have permission to use, or try your course workbook. The complete Murphy books are not included with this site.</p></div></div>';
    return '<div class="mybooks-grid">'+this.bookList.map((b,i)=>'<article class="mybook-card"><div class="mybook-spine spine-'+i%4+'">'+this.icon('book')+'<span>MY COPY</span></div><div class="mybook-content"><h3>'+esc(b.title)+'</h3><p>'+b.pageCount+' pages · '+b.textPages+' with extracted text</p><p class="save-hint">Last opened: page '+b.lastPage+(b.textPoorPages?' · '+b.textPoorPages+' pages with little or no text':'')+'</p><div class="mybook-actions"><a class="btn btn-primary btn-small" href="'+bookURL(b.id,b.lastPage)+'">Continue reading</a><button class="icon-btn" data-action="g-remove" data-book="'+b.id+'" aria-label="Remove '+esc(b.title)+'">'+this.icon('trash')+'</button></div></div></article>').join('')+'</div>';
  }
  editionsPage() {
    return '<div class="edition-intro"><h2>A companion to your Murphy book.</h2><p>Choose the level and English variety that fits you. These links open Cambridge’s official editions. Full books are not hosted here.</p><p class="save-hint">Online ebooks use Cambridge’s own learning platform; they are not downloadable PDFs for this reader.</p></div><div class="editions-grid">'+this.data.books.map((b,i)=>'<article class="edition-card"><div class="edition-art edition-'+i+'"><span>'+esc(b.variety)+'</span><h3>'+esc(b.title)+'</h3><strong>'+esc(b.level)+'</strong></div><div class="edition-copy"><span class="eyebrow">'+esc(b.edition)+'</span><p class="edition-author">'+esc(Array.isArray(b.authors)?b.authors.join(', '):b.authors)+'</p><p>'+esc(b.description)+'</p><div class="edition-links">'+external(b.official_url,'Official Cambridge ebook')+(b.preview_url?external(b.preview_url,'Preview & contents'):'')+'</div></div></article>').join('')+'</div><div class="grammar-reading-method"><span class="eyebrow">A SIMPLE STUDY ROUTINE</span><h2>Read one point. Use it five times.</h2><p>Spend part of today’s 15-minute language block on a relevant grammar point. Close the explanation, make five sentences about your own life, and use two of them in your conversation.</p><p lang="hy">Կարդա մեկ կանոն, փակիր բացատրությունը և քո մասին հինգ նախադասություն ասա։ Հետո երկուսը կիրառիր իրական զրույցում։</p></div>';
  }
  readerPage() {
    const b=this.reader,n=Math.min(b.pageCount,Math.max(1,this.route.page||b.lastPage)),page=b.pages[n-1];
    const marked=b.bookmarks.includes(n),hasOutline=b.outline?.length;
    const pageInput='<form class="reader-page-form" id="reader-page-form"><label for="reader-page">Page</label><input class="text-input" id="reader-page" type="number" min="1" max="'+b.pageCount+'" value="'+n+'" aria-label="PDF page number"><span>of '+b.pageCount+'</span><button class="btn btn-secondary btn-small" type="button" data-action="g-go-page">Go</button></form>';
    const navigation=(withInput=true)=>'<div class="reader-pagination"><a class="btn btn-secondary '+(n===1?'is-disabled':'')+'" href="'+bookURL(b.id,Math.max(1,n-1))+'" '+(n===1?'aria-disabled="true" tabindex="-1"':'')+'>Previous page</a>'+(withInput?pageInput:'<span class="reader-page-position">Page '+n+' of '+b.pageCount+'</span>')+'<a class="btn btn-primary '+(n===b.pageCount?'is-disabled':'')+'" href="'+bookURL(b.id,Math.min(b.pageCount,n+1))+'" '+(n===b.pageCount?'aria-disabled="true" tabindex="-1"':'')+'>Next page</a></div>';
    const warnings=b.textPoorPages?'<div class="reader-quality-note">'+this.icon('info')+'<p>'+b.textPoorPages+' of '+b.pageCount+' pages have little or no selectable text. Original-page view preserves their layout. This reader does not perform OCR.</p></div>':'';
    return '<header class="reader-heading"><a class="text-link" href="#/grammar?tab=books">My bookshelf</a><span class="eyebrow">PRIVATE READING · SAVED ON THIS DEVICE</span><h1>'+esc(b.title)+'</h1><p>'+b.pageCount+' pages · '+b.textPages+' pages with extracted text</p></header>'+navigation()+'<div class="reader-toolbar"><div class="reader-view-switch" role="group" aria-label="Reading view"><button data-action="g-view" data-view="text" class="'+(this.readerMode==='text'?'active':'')+'" aria-pressed="'+(this.readerMode==='text')+'">Extracted text</button><button data-action="g-view" data-view="original" class="'+(this.readerMode==='original'?'active':'')+'" aria-pressed="'+(this.readerMode==='original')+'">Original page</button></div><div class="reader-small-actions"><button class="icon-btn" data-action="g-font" data-direction="-1" aria-label="Decrease reading text size">A−</button><button class="icon-btn" data-action="g-font" data-direction="1" aria-label="Increase reading text size">A+</button><button class="icon-btn '+(marked?'is-saved':'')+'" data-action="g-bookmark" aria-label="'+(marked?'Remove page bookmark':'Bookmark this page')+'" aria-pressed="'+marked+'">'+this.icon('bookmark')+'</button></div></div><div class="reader-layout"><aside class="reader-tools"><label class="search-box">'+this.icon('search')+'<input type="search" id="book-search" placeholder="Search the whole book" aria-label="Search book text" value="'+esc(this.readerQuery)+'" maxlength="100"></label><div id="book-search-results">'+this.searchResults()+'</div><details class="reader-contents"><summary>Contents & bookmarks</summary><h3>Your bookmarks</h3><div id="reader-bookmarks">'+this.bookmarksMarkup()+'</div>'+(hasOutline?'<h3>PDF contents</h3><div class="outline-list">'+this.outlineMarkup(b.outline)+'</div>':'<p class="muted">This PDF has no linked contents. Search a topic or enter a page number.</p>')+'</details><details class="reader-note-box"><summary>Page notes</summary><label class="field-label" for="book-note">Your note for page '+n+'</label><textarea class="text-area" id="book-note" rows="5" maxlength="6000" placeholder="A useful example, question, or correction…">'+esc(this.noteDraft)+'</textarea><button class="btn btn-secondary btn-small" data-action="g-save-note">Save note</button><span id="book-note-status" role="status">'+(this.notesDirty?'Unsaved changes':'')+'</span><button class="text-link" data-action="g-export-notes">Export all book notes</button></details></aside><article class="reader-paper"><div class="reader-paper-meta"><span>PDF PAGE '+pad(n)+'</span><span>'+(this.readerMode==='text'?'EXTRACTED TEXT':'ORIGINAL LAYOUT')+'</span></div><div id="reader-page-content">'+(this.readerMode==='text'?this.pageText(page):'<p id="canvas-status" role="status">Rendering the original page…</p><canvas id="book-page-canvas" aria-label="Original PDF page '+n+'"></canvas>')+'</div><p class="reader-page-footnote">For tables, illustrations, or an unclear reading order, use Original page. Page numbers refer to the PDF file.</p></article></div>'+warnings+'<div class="reader-bottom-navigation">'+navigation(false)+'</div>';
  }
  pageText(page) {
    if(!page?.hasText)return '<div class="reader-empty-page"><h2>No selectable text on this page.</h2><p>This may be an image, a scan, or a blank page. Switch to Original page to see it.</p><button class="btn btn-primary" data-action="g-view" data-view="original">View original page</button></div>';
    return '<div class="reader-text" style="--reading-size:'+this.fontSize+'px">'+(page.paragraphs?.length?page.paragraphs:[page.text]).map(p=>'<p>'+highlight(p,this.readerQuery)+'</p>').join('')+'</div>';
  }
  searchResults() {
    const q=this.readerQuery.trim();if(!q||!this.reader)return '';
    const matches=this.reader.pages.filter(p=>p.text.toLowerCase().includes(q.toLowerCase()));
    return '<section class="book-search-results" aria-live="polite"><p><strong>'+matches.length+'</strong> matching '+(matches.length===1?'page':'pages')+'</p>'+matches.slice(0,35).map(p=>{const index=p.text.toLowerCase().indexOf(q.toLowerCase()),snippet=p.text.slice(Math.max(0,index-45),index+q.length+95);return '<a href="'+bookURL(this.reader.id,p.number)+'"><strong>Page '+p.number+'</strong><span>'+highlight(snippet,q)+'</span></a>';}).join('')+(matches.length>35?'<p class="muted">Showing the first 35 pages. Use a more specific phrase to narrow the results.</p>':'')+'</section>';
  }
  bookmarksMarkup() {return this.reader.bookmarks.length?this.reader.bookmarks.map(n=>'<a href="'+bookURL(this.reader.id,n)+'">Page '+n+'</a>').join(''):'<p class="muted">Use the bookmark button to save a page.</p>';}
  outlineMarkup(items,depth=0) {
    if(depth>3)return '';
    return items.slice(0,100).map(item=>(item.page?'<a href="'+bookURL(this.reader.id,item.page)+'">'+esc(item.title)+'</a>':'<span>'+esc(item.title)+'</span>')+(item.children?.length?'<div class="outline-children">'+this.outlineMarkup(item.children,depth+1)+'</div>':'')).join('');
  }
  async drawOriginal(token=this.mountToken) {
    const canvas=$('#book-page-canvas');if(!canvas||!this.reader)return;
    const controller=this.renderAbort=new AbortController();
    try {await this.library.renderPage(this.reader.id,this.route.page,canvas,{width:Math.max(180,canvas.parentElement.clientWidth),signal:controller.signal});if(token===this.mountToken&&$('#canvas-status'))$('#canvas-status').remove();}
    catch(error){if(error.name!=='AbortError'&&token===this.mountToken&&$('#canvas-status'))$('#canvas-status').textContent=error.message||'The original page could not render.';}
  }
  save(ok){if(!ok)this.host.notify('Browser storage is unavailable. Export your course progress before closing this tab.');return ok;}
  async importBook(file,isDemo=false) {
    if(this.importController)return;
    this.importController=new AbortController();this.importError='';this.importStatus={percent:0,message:'Preparing your book…'};
    this.host.requestRender();
    try{
      const book=await this.library.importPdf(file,{signal:this.importController.signal,onProgress:p=>{this.importStatus=p;const status=$('#book-import-status');if(status)status.innerHTML=this.importMarkup();}});
      if(isDemo){await this.library.update(book.id,{title:'Your 30-day speaking workbook'});book.title='Your 30-day speaking workbook';}
      this.bookList=await this.library.list();this.importStatus=null;
      this.host.notify(book.duplicate?'This book is already on your shelf.':'Your book is ready. '+book.textPages+' pages have extracted text.');
      if(this.route.view==='grammar'&&this.route.tab==='books')location.hash=bookURL(book.id,book.lastPage);
    }catch(error){this.importError=error.name==='AbortError'?'Import cancelled. No incomplete book was saved.':error.message;this.importStatus=null;this.host.notify(this.importError);}
    finally{this.importController=null;if(this.route.view==='grammar'&&this.route.tab==='books')this.host.requestRender();}
  }
  async goToPage() {
    const input=$('#reader-page');if(!input||!this.reader)return;
    const n=Math.min(this.reader.pageCount,Math.max(1,Math.round(Number(input.value)||1)));
    if(this.notesDirty||this.noteSaving)await this.saveNote(false);
    input.value=n;location.hash=bookURL(this.reader.id,n);
  }
  async saveNote(showMessage=true) {
    if(this.noteSaving)await this.noteSaving;
    if(!this.reader||!this.noteBook||!this.notePage||!this.notesDirty)return;
    const id=this.noteBook,page=this.notePage,value=this.noteDraft;
    const status=$('#book-note-status');if(status)status.textContent='Saving…';
    const pending=this.library.update(id,{notes:{[page]:value}});
    this.noteSaving=pending;
    try {
      await pending;
      if(this.reader?.id===id)this.reader.notes[page]=value;
      if(this.noteBook===id&&this.notePage===page&&this.noteDraft===value){this.notesDirty=false;if($('#book-note-status'))$('#book-note-status').textContent='Saved on this device.';}
    } catch(error) {
      if($('#book-note-status'))$('#book-note-status').textContent='Could not save. Please try again.';
      throw error;
    } finally {if(this.noteSaving===pending)this.noteSaving=null;}
    if(this.notesDirty)await this.saveNote(false);
    if(showMessage)this.host.notify('Your page note is saved.');
  }
  async click(event) {
    const button=event.target.closest('[data-action]');if(!button||!button.dataset.action.startsWith('g-'))return;
    const action=button.dataset.action;
    if(action==='g-retry'){await this.load();this.host.requestRender();}
    else if(action==='g-level'){this.level=button.dataset.level;this.host.requestRender();}
    else if(action==='g-save-topic'){const id=button.dataset.topic,p=Store.grammarState(id);this.save(Store.setGrammar(id,{saved:!p.saved}));button.setAttribute('aria-pressed',String(!p.saved));button.classList.toggle('is-saved',!p.saved);button.setAttribute('aria-label',(!p.saved?'Unsave ':'Save ')+this.data.lessons.find(t=>t.id===id).title);}
    else if(action==='g-check'){const t=this.data.lessons.find(t=>t.id===button.dataset.topic);this.save(Store.setGrammar(t.id,{checked:true}));const p=Store.grammarState(t.id);t.exercises.forEach((x,i)=>{const field=$('#grammar-feedback-'+i);if(field)field.innerHTML=this.feedback(x,p.answers[i]);});$('#grammar-score').textContent=this.score(t,p);}
    else if(action==='g-practised'){const id=button.dataset.topic,p=Store.grammarState(id);this.save(Store.setGrammar(id,{practised:!p.practised}));this.host.requestRender();}
    else if(action==='g-import'){$('#private-book-file').value='';$('#private-book-file').click();}
    else if(action==='g-demo'){if(this.importController)return;button.disabled=true;try{const r=await fetch('./workbook.pdf');if(!r.ok)throw new Error('The sample workbook could not be downloaded. Check your connection.');await this.importBook(new File([await r.blob()],'Fluent30-workbook.pdf',{type:'application/pdf'}),true);}finally{if(button.isConnected)button.disabled=false;}}
    else if(action==='g-cancel-import')this.importController?.abort();
    else if(action==='g-view'){if(this.notesDirty)await this.saveNote(false);this.readerMode=button.dataset.view==='original'?'original':'text';this.host.requestRender();}
    else if(action==='g-font'){this.fontSize=Math.min(26,Math.max(16,this.fontSize+Number(button.dataset.direction)*2));const text=$('.reader-text');if(text)text.style.setProperty('--reading-size',this.fontSize+'px');}
    else if(action==='g-bookmark'){
      const b=this.reader,n=this.route.page;if(!b||button.disabled)return;
      const set=new Set(b.bookmarks);set.has(n)?set.delete(n):set.add(n);const marks=[...set].sort((a,b)=>a-b);
      button.disabled=true;
      try{
        await this.library.update(b.id,{bookmarks:marks});b.bookmarks=marks;
        if(this.route.view==='reader'&&this.reader?.id===b.id&&this.route.page===n){
          button.classList.toggle('is-saved',set.has(n));button.setAttribute('aria-pressed',String(set.has(n)));button.setAttribute('aria-label',set.has(n)?'Remove page bookmark':'Bookmark this page');
          const bookmarks=$('#reader-bookmarks');if(bookmarks)bookmarks.innerHTML=this.bookmarksMarkup();
        }
      }finally{button.disabled=false;}
    }
    else if(action==='g-go-page')await this.goToPage();
    else if(action==='g-save-note')await this.saveNote();
    else if(action==='g-export-notes'){if(this.notesDirty)await this.saveNote(false);const b=this.reader;const lines=['# '+b.title,'','PDF pages: '+b.pageCount,'Bookmarks: '+(b.bookmarks.join(', ')||'none'),''];Object.entries(b.notes).filter(([,v])=>v.trim()).sort((a,b)=>Number(a[0])-Number(b[0])).forEach(([n,v])=>lines.push('## Page '+n,'',v,''));download(new Blob([lines.join('\n')],{type:'text/markdown;charset=utf-8'}),'fluent30-book-notes.md');}
    else if(action==='g-remove'){const b=this.bookList.find(b=>b.id===button.dataset.book);if(!b)return;this.host.openModal('Remove this book?', '<p>Remove <strong>'+esc(b.title)+'</strong>, its extracted text, bookmarks, and notes from this browser?</p><p>Your original PDF outside this website is not changed. Export any notes you want to keep first.</p><div class="download-row"><button class="btn btn-secondary" data-action="close-modal">Keep book</button><button class="btn btn-danger" data-action="g-remove-confirm" data-book="'+b.id+'">Remove from this browser</button></div>');}
    else if(action==='g-remove-confirm'){button.disabled=true;try{const removed=await this.library.remove(button.dataset.book);if(!removed)throw new Error('This book was not found.');if(this.reader?.id===button.dataset.book)this.reader=null;this.bookList=await this.library.list();this.host.closeModal();this.host.requestRender();this.host.notify('Book removed from this browser.');}catch(error){button.disabled=false;throw error;}}
  }
  input(event) {
    const el=event.target;
    if(el.id==='grammar-search'){this.query=el.value;if($('#grammar-topic-results'))$('#grammar-topic-results').innerHTML=this.topicCards();}
    if(el.dataset.grammarAnswer!==undefined){const id=el.dataset.topic,p=Store.grammarState(id);this.save(Store.setGrammar(id,{answers:{...p.answers,[el.dataset.grammarAnswer]:el.value.slice(0,400)},checked:false}));const feedback=$('#grammar-feedback-'+el.dataset.grammarAnswer);if(feedback)feedback.innerHTML='';if($('#grammar-score'))$('#grammar-score').textContent='';}
    if(el.id==='book-search'){this.readerQuery=el.value;if($('#book-search-results'))$('#book-search-results').innerHTML=this.searchResults();if(this.readerMode==='text'&&$('#reader-page-content'))$('#reader-page-content').innerHTML=this.pageText(this.reader.pages[this.route.page-1]);}
    if(el.id==='book-note'){this.noteDraft=el.value;this.notesDirty=true;if($('#book-note-status'))$('#book-note-status').textContent='Unsaved changes';}
  }
  async change(event){if(event.target.id==='private-book-file'&&event.target.files?.[0])await this.importBook(event.target.files[0]);}
}

