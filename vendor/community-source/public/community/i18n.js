import {english} from './messages-en.js';
import {initialLocale} from './locale-preference.js';
export {resolveLocale,readLocale,localeUrl} from './locale-preference.js';
export const locale=typeof __COMMUNITY_LOCALE__!=='undefined'?__COMMUNITY_LOCALE__:initialLocale();
export const formatLocale=locale==='en'?'en-US':'ko-KR';
export const guideUrl='https://guide.guildwar.win/'+(locale==='en'?'en/':'');
export function translate(key,values={},language=locale){
  const message=language==='en'&&Object.hasOwn(english,key)?english[key]:key;
  return message.replace(/\{(\w+)\}/g,(token,name)=>Object.hasOwn(values,name)?String(values[name]):token);
}
export const t=translate;
export const categoryName=name=>locale==='en'&&Object.hasOwn(english,'category:'+name)?english['category:'+name]:name;
export const numberText=value=>Number(value).toLocaleString(formatLocale);
