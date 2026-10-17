import {fetchJSON} from './catalogue-loader.js';
import ui from './locales.json' with {type:'json'};
export const LANGUAGES=['hy','ru','en'];
let language='hy', research={}, projectLocales={};
export const locale=()=>({hy:'hy-AM',ru:'ru-RU',en:'en-GB'}[language]);
export const getLanguage=()=>language;
export function setLanguage(value){language=LANGUAGES.includes(value)?value:'hy';document.documentElement.lang=language;}
export function t(key,values={}){const text=language==='en'?key:(ui[key]?.[language]||research[key]?.[language]||key);return text.replace(/\{(\w+)\}/g,(_,k)=>String(values[k]??`{${k}}`));}
export function tr(text){return t(String(text??''));}
export function projectText(p,field){const suffix=language==='hy'?'Hy':language==='ru'?'Ru':'';return (suffix&&(projectLocales[p.id]?.[field+suffix]||p[field+suffix]))||p[field]||'';}
export function number(n,digits=2){return new Intl.NumberFormat(locale(),{maximumFractionDigits:digits}).format(n);}
export function money(n){return n==null?t('Not published'):new Intl.NumberFormat(locale(),{style:'currency',currency:'AMD',maximumFractionDigits:0}).format(n);}
export function million(n){return n==null?'—':`${number(n/1e6)} ${t('million AMD')}`;}
export function date(value,full=false){if(!value)return t('Not published');if(/^\d{4}$/.test(value))return value;const d=new Date(value);return isNaN(d)?value:new Intl.DateTimeFormat(locale(),{day:full?'numeric':undefined,month:full?'long':'short',year:'numeric',timeZone:'Asia/Yerevan'}).format(d);}
export async function loadTranslations(){const paths=['/data/research-translations.json','/data/project-locales.json'],responses=await Promise.allSettled(paths.map(path=>fetchJSON(path)));const failures=[];[research,projectLocales]=responses.map((r,i)=>{if(r.status==='fulfilled'&&r.value&&typeof r.value==='object'&&!Array.isArray(r.value))return r.value;failures.push(paths[i]);return {};});return failures;}
export function translateDOM(root=document){root.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));root.querySelectorAll('[data-i18n-placeholder]').forEach(el=>el.placeholder=t(el.dataset.i18nPlaceholder));root.querySelectorAll('[data-i18n-label]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.i18nLabel)));root.querySelectorAll('[data-i18n-title]').forEach(el=>el.title=t(el.dataset.i18nTitle));}
