import { cp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import './prepare-vendor.mjs';
const course=JSON.parse(await readFile('public/course.json','utf8'));
if(course.days.length!==30 || course.days.some((d,i)=>d.day!==i+1)) throw new Error('The course must contain all 30 days.');
for(const day of course.days) {
  for(const key of ['primary','support']) if(!new URL(day[key].url).protocol.startsWith('https')) throw new Error('An invalid resource URL was found.');
  if(day.drill.items.length!==3 || day.drill.answers.length!==3 || day.input_tasks.length!==3 || day.input_answers.length!==3) throw new Error('Incomplete lesson '+day.day);
}
const grammar=JSON.parse(await readFile('public/grammar-content.json','utf8'));
if(grammar.lessons.length!==12||new Set(grammar.lessons.map(l=>l.id)).size!==12)throw new Error('Grammar topics must have 12 unique IDs.');
const coveredDays=new Set();
for(const topic of grammar.lessons){
  if(topic.exercises.length!==4||topic.examples.length!==3||topic.speaking_prompts.length!==2)throw new Error('Incomplete grammar topic '+topic.id);
  for(const exercise of topic.exercises)if(!exercise.answer||!exercise.explanation_hy)throw new Error('Missing grammar answer in '+topic.id);
  topic.related_days.forEach(day=>coveredDays.add(day));
}
if(Array.from({length:30},(_,i)=>i+1).some(day=>!coveredDays.has(day)))throw new Error('All course days need a grammar connection.');
for(const book of grammar.books)for(const key of ['official_url','preview_url'])if(book[key]&&new URL(book[key]).protocol!=='https:')throw new Error('Invalid publisher link.');
for(const f of ['index.html','app.js','store.js','recorder.js','grammar.js','books.js','grammar-content.json','styles.css','details.css','grammar.css','sw.js','vendor/pdfjs/pdf.js','vendor/pdfjs/pdf.worker.js']) await stat('public/'+f);
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
await cp('public','dist',{recursive:true,filter:source=>!source.endsWith('qa-preview.html')});
console.log('Fluent /30: 30 days, 12 original grammar topics, 48 grammar exercises, and a private PDF reader. Static build ready in dist/.');
