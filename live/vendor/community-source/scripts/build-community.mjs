import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {localizedEntryHtml,assetHeaders,inlineEntryStyles} from './community-entry.mjs';
import {communityBundles} from './community-bundles.mjs';
import {writeCommunityEntries,licenseEntryHtml} from './community-routes.mjs';
import {guideNavigation} from '../public/community/guide-shell.js';

const root=fileURLToPath(new URL('../',import.meta.url));
// Generate the English shell for the explicit community entry as well.
const {english}=await import('../public/community/messages-en.js');
const {outputs,locales,bootstrap}=await communityBundles(root);
const viewerCSS=await readFile(path.join(root,'node_modules/photoswipe/dist/photoswipe.css'),'utf8');
const styles=await Promise.all(['styles.css','content.css','guide-shell.css'].map(async file=>({href:'/community/'+file,css:(file==='styles.css'?viewerCSS+'\n':'')+await readFile(path.join(root,'public/community',file),'utf8')})));
const templateEntry=localizedEntryHtml(await readFile(path.join(root,'public/community.html'),'utf8'),bootstrap);
const navigationData=JSON.parse(await readFile(path.join(root,'public/community/guide-navigation.json'),'utf8'));
const navigation=(html,locale)=>html.replace(/(<nav\b[^>]*id="guide-navigation"[^>]*>)[\s\S]*?<\/nav>/,(_match,open)=>open.replace('>',' data-guide-locale="'+locale+'">')+guideNavigation(locale,navigationData)+'</nav>');
const koreanEntry=inlineEntryStyles(navigation(templateEntry,'ko'),styles);
await writeFile(path.join(root,'public/community/build/entry.html'),koreanEntry);
await writeFile(path.join(root,'public/_headers'),assetHeaders(await readFile(path.join(root,'public/_headers'),'utf8'),outputs));
await writeFile(path.join(root,'public/community/build/manifest.json'),JSON.stringify({builtAt:new Date().toISOString(),outputs:[...Object.keys(outputs),'public/community/build/entry.html'],locales,initialModules:locales.ko,initialBytes:locales.ko.reduce((sum,file)=>sum+outputs[file].bytes,0),bootstrapBytes:Buffer.byteLength(bootstrap)},null,2));
let englishEntry=templateEntry;
englishEntry=englishEntry.replace('<html lang="ko">','<html lang="en">')
  .replace('<title>커뮤니티 · 길드워 2 한국어 가이드</title>','<title>Community · Guild Wars 2 Guide</title>')
  .replace(/(data-ui="([^"]+)"[^>]*>)[^<]*/g,(_match,start,key)=>start+(english[key]||key))
  .replace(/aria-label="([^"]+)"/g,(_match,key)=>'aria-label="'+(english[key]||key)+'"')
  .replaceAll('href="https://guide.guildwar.win/"','href="https://guide.guildwar.win/en/"');
// Translate HTML labels before embedding CSS; aria-label selectors are code.
englishEntry=inlineEntryStyles(navigation(englishEntry,'en'),styles);
await mkdir(path.join(root,'public/en'),{recursive:true});
await writeFile(path.join(root,'public/en/index.html'),englishEntry);
await Promise.all([
  writeFile(path.join(root,'public/community/licenses.html'),licenseEntryHtml(koreanEntry,'ko')),
  writeFile(path.join(root,'public/community/licenses-en.html'),licenseEntryHtml(englishEntry,'en')),
  writeFile(path.join(root,'public/en/licenses.html'),licenseEntryHtml(englishEntry,'en'))
]);
// Ship the selected runtime and its readable sources together. No Tiny Cloud.
const tiny=path.join(root,'node_modules/tinymce'),vendor=path.join(root,'public/vendor/tinymce');
await mkdir(vendor,{recursive:true});
for(const part of ['tinymce.min.js','tinymce.js','license.md','notices.txt','icons','models','themes','skins'])await cp(path.join(tiny,part),path.join(vendor,part),{recursive:true});
for(const plugin of ['autoresize','autolink','lists','link','image','table'])await cp(path.join(tiny,'plugins',plugin),path.join(vendor,'plugins',plugin),{recursive:true});
const font=path.join(root,'node_modules/@fontsource-variable/noto-sans-kr'),fontOut=path.join(root,'public/vendor/fonts/noto');
await mkdir(fontOut,{recursive:true});
const css=await readFile(path.join(font,'index.css'),'utf8');
await writeFile(path.join(fontOut,'index.css'),css);
await cp(path.join(font,'LICENSE'),path.join(fontOut,'LICENSE'));
await mkdir(path.join(fontOut,'files'),{recursive:true});
for(const file of new Set([...css.matchAll(/\.\/files\/([^)'"\s]+)/g)].map(match=>match[1])))await cp(path.join(font,'files',file),path.join(fontOut,'files',file));
await cp(path.join(root,'node_modules/dompurify/LICENSE'),path.join(root,'public/vendor/DOMPurify-LICENSE'));
await cp(path.join(root,'node_modules/dompurify/dist/purify.js'),path.join(root,'public/vendor/DOMPurify.js'));
await cp(path.join(root,'node_modules/photoswipe/LICENSE'),path.join(root,'public/vendor/PhotoSwipe-LICENSE'));
await cp(path.join(root,'node_modules/photoswipe/dist/photoswipe.esm.js'),path.join(root,'public/vendor/PhotoSwipe.js'));
await cp(path.join(root,'../LICENSE'),path.join(root,'public/vendor/BASE-LICENSE')).catch(async error=>{if(error.code!=='ENOENT')throw error;await cp(path.join(root,'LICENSE'),path.join(root,'public/vendor/BASE-LICENSE'));});
const source=path.join(root,'public/vendor/community-source');
await mkdir(source,{recursive:true});
await cp(path.join(root,'public/vendor/BASE-LICENSE'),path.join(source,'LICENSE'));
for(const relative of ['public/community','public/community.html','public/member-credential.js','public/guest-credential.js','public/md.js','src/community-content.js','src/community-font-sizes.js','src/community-file-policy.js','scripts/build-community.mjs','scripts/community-entry.mjs','scripts/community-bundles.mjs','scripts/community-routes.mjs','package.json','package-lock.json']){
  const target=path.join(source,relative);await mkdir(path.dirname(target),{recursive:true});await cp(path.join(root,relative),target,{recursive:true,filter:entry=>entry!==path.join(root,'public/community/build')});
}
await writeFile(path.join(source,'README.txt'),'GW2 community browser source\n\nThe readable browser modules are under public/community/.\nShared document validation: src/community-content.js\nAuthentication helpers: public/member-credential.js and public/guest-credential.js\nMarkdown renderer: public/md.js\nBuild: scripts/build-community.mjs\nExact dependency versions: package.json and package-lock.json\nInstall with npm ci, then npm run build:community.\nBase license: ../BASE-LICENSE (GPL v2).\nTinyMCE readable sources and notices: ../tinymce/. DOMPurify: ../DOMPurify.js and ../DOMPurify-LICENSE. PhotoSwipe: ../PhotoSwipe.js and ../PhotoSwipe-LICENSE (MIT). Font: ../fonts/noto/LICENSE.\nNo server credentials, environment files or private user data are distributed here.\n');
// The isolated UX server uses the same site/community entries as a release.
// Keep the upstream public/index.html source for its separate legacy tests.
const uxAssets=path.join(root,'.wrangler/ux-assets');
await cp(path.join(root,'public'),uxAssets,{recursive:true});
await writeCommunityEntries(uxAssets,{ko:koreanEntry,en:englishEntry});
console.log('Community app, editor and fonts built locally.');
