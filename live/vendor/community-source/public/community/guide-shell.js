import {locale,t} from './i18n.js';
import {esc} from './ui.js';

export function guideHref(path='/',language=locale){
  if(!/^\/(?!\/)/.test(path))throw Error('Expected a guide path');
  const url=new URL((language==='en'?'/en':'')+path,'https://guide.guildwar.win');
  if(url.origin!=='https://guide.guildwar.win')throw Error('Expected a guide path');
  url.searchParams.set('lang',language);
  return url.href;
}

export function guideNavigation(language=locale,data){
  return Object.values(data.navigation[language]).map(section=>
    `<details class="guide-section"><summary>${esc(section.label)}</summary><div class="guide-panel"><div class="guide-panel-inner"><div class="guide-panel-intro"><p>${t('가이드 둘러보기',{},language)}</p><h2>${esc(section.label)}</h2><p>${esc(section.desc)}</p><a href="${guideHref(section.href,language)}">${t('섹션 시작 페이지',{},language)} ↗</a></div><div class="guide-groups" style="--columns:${Math.min(4,section.groups.length)}">${section.groups.map(group=>`<section><h3>${esc(group.label)}</h3><ul>${group.pages.map(page=>`<li><a href="${guideHref(page.href,language)}">${esc(page.label)}</a></li>`).join('')}</ul></section>`).join('')}</div></div></div></details>`
  ).join('')+(language==='ko'?`<a class="guide-community" href="#list" aria-current="page">${t('커뮤니티',{},language)}</a>`:'');
}

export function initGuideShell(data){
  const header=document.querySelector('.guide-header'),nav=header.querySelector('#guide-navigation');
  if(!nav.children.length||nav.dataset.guideLocale!==locale){
    if(!data)return fetch('/community/guide-navigation.json').then(response=>{if(!response.ok)throw Error('Navigation unavailable');return response.json();}).then(data=>initGuideShell(data));
    nav.innerHTML=guideNavigation(locale,data);nav.dataset.guideLocale=locale;
  }
  const sections=[...nav.querySelectorAll('details')],toggle=header.querySelector('.guide-menu-toggle');
  const desktop=matchMedia('(min-width:1201px)');
  let openTimer,closeTimer;
  const cancelHover=()=>{clearTimeout(openTimer);clearTimeout(closeTimer);};
  const closeSections=except=>{cancelHover();for(const section of sections)if(section!==except)section.open=false;};
  const closeMobile=()=>{header.classList.remove('menu-open');toggle.setAttribute('aria-expanded','false');};
  const community=nav.querySelector('.guide-community');
  if(community)community.onclick=()=>{closeSections();closeMobile();};
  for(const section of sections){
    section.addEventListener('toggle',()=>{if(section.open)for(const other of sections)if(other!==section)other.open=false;});
    section.addEventListener('pointerenter',event=>{
      if(!desktop.matches||event.pointerType!=='mouse')return;
      cancelHover();
      openTimer=setTimeout(()=>{closeSections(section);section.open=true;},130);
    });
    section.addEventListener('pointerleave',event=>{
      if(!desktop.matches||event.pointerType!=='mouse')return;
      cancelHover();
      // A quick pass over a sibling can cancel the old menu's close timer.
      // Once the pointer leaves navigation, close every unfocused menu.
      closeTimer=setTimeout(()=>{for(const item of sections)if(!item.contains(document.activeElement))item.open=false;},200);
    });
    // A click/keyboard action must not be undone by a pending hover timer.
    section.querySelector('summary').addEventListener('click',cancelHover);
  }
  community?.addEventListener('pointerenter',event=>{
    if(desktop.matches&&event.pointerType==='mouse')closeSections();
  });
  toggle.onclick=()=>{
    const open=header.classList.toggle('menu-open');toggle.setAttribute('aria-expanded',String(open));
    if(!open)closeSections();
  };
  document.addEventListener('click',event=>{if(!header.contains(event.target)){closeSections();closeMobile();}});
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    const section=sections.find(item=>item.open);
    if(section){section.querySelector('summary').focus();closeSections();}
    else if(header.classList.contains('menu-open')){closeMobile();toggle.focus();}
  });
  header.addEventListener('focusout',event=>{if(event.relatedTarget&&!header.contains(event.relatedTarget)){closeSections();closeMobile();}});
  desktop.addEventListener('change',()=>{closeSections();closeMobile();});
}
const fontScheduled=new WeakSet();
export function loadCommunityFont(doc=document,frame=requestAnimationFrame){
  if(fontScheduled.has(doc))return;
  fontScheduled.add(doc);
  // Give the rendered content one paint before optional font requests compete
  // with the modules and API response needed to open the community.
  frame(()=>frame(()=>{
    const link=doc.createElement('link');link.rel='stylesheet';link.href='/vendor/fonts/noto/index.css';link.dataset.communityFont='';doc.head.append(link);
  }));
}
