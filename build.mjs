import { cp, mkdir, readFile, rm, stat } from 'node:fs/promises';
const course=JSON.parse(await readFile('public/course.json','utf8'));
if(course.days.length!==30 || course.days.some((d,i)=>d.day!==i+1)) throw new Error('The course must contain all 30 days.');
for(const day of course.days) {
  for(const key of ['primary','support']) if(!new URL(day[key].url).protocol.startsWith('https')) throw new Error('An invalid resource URL was found.');
  if(day.drill.items.length!==3 || day.drill.answers.length!==3 || day.input_tasks.length!==3 || day.input_answers.length!==3) throw new Error('Incomplete lesson '+day.day);
}
for(const f of ['index.html','app.js','store.js','recorder.js','styles.css','details.css','sw.js']) await stat('public/'+f);
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
await cp('public','dist',{recursive:true,filter:source=>!source.endsWith('qa-preview.html')});
console.log('Fluent /30: 30 lessons, 180 exercises and answers. Static build ready in dist/.');
