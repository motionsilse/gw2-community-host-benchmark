import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {licenseContent} from '../public/community/licenses.js';

// Fragments never reach the server. Keep old community bookmarks and recovery
// links on this origin; an unconditional HTTP redirect would send them away.
function routeSiteEntry(){
  const url=new URL(location.href);
  const root=['/','/index.html','/en','/en/','/en/index.html'].includes(url.pathname);
  const explicit=url.searchParams.get('lang');
  const english=explicit==='en'||explicit!=='ko'&&/^\/en(?:\/|$)/.test(url.pathname);
  const community=/^#(?:(?:list|write|drafts|trash|admin(?:\/[\w-]+)*|login|register|forgot|resend|account|terms|licenses|verify|reset|setup)(?:\?|$)|post\/[1-9]\d*(?:\?|$)|(?:verify|reset)=[a-f0-9]{64}$)/.test(url.hash);
  if(root&&community)url.pathname=english?'/en/community':'/community';
  else{
    url.protocol='https:';url.hostname='guide.guildwar.win';url.port='';
    if(root)url.pathname=english?'/en/':'/';
  }
  location.replace(url.href);
}

export function siteEntryHtml(locale='ko'){
  const english=locale==='en',guide='https://guide.guildwar.win/'+(english?'en/':'');
  return `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${english?'Guild Wars 2 Player Guide':'길드워2 입문 가이드'}</title>
<link rel="canonical" href="${guide}">
<script data-site-entry>(${routeSiteEntry.toString()})();</script>
<noscript><meta http-equiv="refresh" content="0;url=${guide}"></noscript>
</head><body><p><a href="${guide}">${english?'Open the Guild Wars 2 guide':'길드워2 입문 가이드로 이동'}</a></p></body></html>
`;
}

export async function writeCommunityEntries(directory,{ko,en}){
  await mkdir(path.join(directory,'en'),{recursive:true});
  await mkdir(path.join(directory,'community'),{recursive:true});
  await Promise.all([
    writeFile(path.join(directory,'index.html'),siteEntryHtml('ko')),
    writeFile(path.join(directory,'en/index.html'),siteEntryHtml('en')),
    writeFile(path.join(directory,'community.html'),ko),
    writeFile(path.join(directory,'en/community.html'),en),
    writeFile(path.join(directory,'community/licenses.html'),licenseEntryHtml(ko,'ko')),
    writeFile(path.join(directory,'community/licenses-en.html'),licenseEntryHtml(en,'en')),
    writeFile(path.join(directory,'en/licenses.html'),licenseEntryHtml(en,'en'))
  ]);
}

function routeLicenseEntry(locale){
  const url=new URL(location.href);
  url.pathname=locale==='en'?'/en/community':'/community';url.searchParams.set('lang',locale);
  if(!url.hash)url.hash='#licenses';
  history.replaceState(null,'',url.pathname+url.search+url.hash);
}
export function licenseEntryHtml(shell,locale){
  const main=/<main\b[^>]*>[\s\S]*?<\/main>/;
  if(!main.test(shell)||!shell.includes('<script data-community-boot>'))throw Error('Missing community shell');
  return shell.replace(/<title>[^<]*<\/title>/,`<title>${locale==='en'?'Open-source licenses · Community':'오픈소스 고지 · 커뮤니티'}</title>`)
    .replace(main,()=>`<main id="main" class="shell" tabindex="-1">${licenseContent(locale)}</main>`)
    .replace('<script data-community-boot>',()=>`<script data-license-entry>(${routeLicenseEntry.toString()})(${JSON.stringify(locale)});</script><script data-community-boot>`);
}
