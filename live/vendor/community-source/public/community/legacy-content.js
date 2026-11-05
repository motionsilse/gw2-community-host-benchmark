import {t} from './i18n.js';
// Run after Markdown rendering and before the final HTML sanitizer. Only text
// nodes are eligible, so examples and links containing [img:n] stay literal.
export function legacyImages(html){
  const doc=new DOMParser().parseFromString('<!doctype html><html><body>'+html+'</body></html>','text/html');
  function visit(parent){
    for(const node of [...parent.childNodes]){
      if(node.nodeType===1){if(!['CODE','PRE','A'].includes(node.tagName))visit(node);continue;}
      if(node.nodeType!==3||!node.textContent.includes('[img:'))continue;
      const value=node.textContent,fragment=doc.createDocumentFragment();let start=0;
      for(const match of value.matchAll(/\[img:([1-9]\d*)\]/g)){
        fragment.append(doc.createTextNode(value.slice(start,match.index)));
        const image=doc.createElement('img');image.setAttribute('src','/api/files/'+match[1]);image.setAttribute('alt',t("기존 첨부 이미지"));fragment.append(image);start=match.index+match[0].length;
      }
      fragment.append(doc.createTextNode(value.slice(start)));node.replaceWith(fragment);
    }
  }
  visit(doc.body);return doc.body.innerHTML;
}
