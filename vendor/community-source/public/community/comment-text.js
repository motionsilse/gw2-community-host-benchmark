import {esc} from './ui.js';

// Read old drafts without attaching their markup or requesting their images.
export function commentTextFromHtml(html){
  const template=document.createElement('template');template.innerHTML=html||'';
  for(const node of template.content.querySelectorAll('script,style,template,noscript,img,iframe,video,audio,object,svg'))node.remove();
  for(const node of template.content.querySelectorAll('br'))node.replaceWith(document.createTextNode('\n'));
  for(const node of template.content.querySelectorAll('p,div,h1,h2,h3,h4,h5,h6,li,blockquote,pre,tr'))node.after(document.createTextNode('\n'));
  return Array.from(template.content.childNodes,node=>node.textContent||'').join('').replace(/\n$/,'');
}
export const commentText=row=>typeof row.body==='string'?row.body:commentTextFromHtml(row.body_html);
export const commentHtml=text=>text.split('\n').map(line=>'<p>'+(line?esc(line):'<br>')+'</p>').join('');
export const commentDocument=text=>({version:1,blocks:text.split('\n').map(line=>({type:'p',children:line?[{type:'text',text:line}]:[{type:'br'}]}))});
