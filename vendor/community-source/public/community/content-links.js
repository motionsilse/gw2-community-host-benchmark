// Operate on sanitized, inert DOM text only; never interpolate URLs into HTML.
export function linkifyContent(root){
  const doc=root.ownerDocument;
  root.normalize();
  function webAddress(value){
    if(value.length>2048||/[\\\u0000-\u0020\u007f]/.test(value))return null;
    const pairs={')':'(',']':'[','}':'{'},counts={};
    for(const character of value)counts[character]=(counts[character]||0)+1;
    while(value){
      const last=value.at(-1);
      if(/[.,!?;:，。！？、；：]/.test(last)||pairs[last]&&(counts[last]||0)>(counts[pairs[last]]||0)){
        counts[last]--;value=value.slice(0,-1);
      }else break;
    }
    try{
      const url=new URL(value);
      return ['http:','https:'].includes(url.protocol)&&url.hostname&&!url.username&&!url.password?value:null;
    }catch{return null;}
  }
  function visit(parent){
    for(const node of [...parent.childNodes]){
      if(node.nodeType===1){if(!['A','CODE','PRE'].includes(node.tagName))visit(node);continue;}
      if(node.nodeType!==3||!/https?:\/\//i.test(node.textContent))continue;
      const value=node.textContent,fragment=doc.createDocumentFragment();let start=0;
      for(const match of value.matchAll(/\bhttps?:\/\/[^\s<>"'`]+/gi)){
        const href=webAddress(match[0]);if(!href)continue;
        fragment.append(doc.createTextNode(value.slice(start,match.index)));
        const link=doc.createElement('a');link.setAttribute('href',href);link.textContent=href;
        fragment.append(link);start=match.index+href.length;
      }
      if(start){fragment.append(doc.createTextNode(value.slice(start)));node.replaceWith(fragment);}
    }
  }
  visit(root);
  for(const anchor of root.querySelectorAll('a')){
    const raw=anchor.getAttribute('href')||'';
    anchor.removeAttribute('target');
    if(/^\/\/|[\u0000-\u0020\u007f\\]/.test(raw)||!/^https?:|^mailto:|^\/(?!\/)|^#/i.test(raw))anchor.removeAttribute('href');
    else if(/^https?:\/\//i.test(raw))anchor.setAttribute('target','_blank');
    anchor.setAttribute('rel','nofollow ugc noopener noreferrer');
  }
}
