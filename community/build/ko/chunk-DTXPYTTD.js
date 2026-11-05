import{a as n}from"./chunk-GHT7LJ4Z.js";function r(t){let e=document.createElement("template");e.innerHTML=t||"";for(let o of e.content.querySelectorAll("script,style,template,noscript,img,iframe,video,audio,object,svg"))o.remove();for(let o of e.content.querySelectorAll("br"))o.replaceWith(document.createTextNode(`
`));for(let o of e.content.querySelectorAll("p,div,h1,h2,h3,h4,h5,h6,li,blockquote,pre,tr"))o.after(document.createTextNode(`
`));return Array.from(e.content.childNodes,o=>o.textContent||"").join("").replace(/\n$/,"")}var m=t=>typeof t.body=="string"?t.body:r(t.body_html),p=t=>t.split(`
`).map(e=>"<p>"+(e?n(e):"<br>")+"</p>").join(""),l=t=>({version:1,blocks:t.split(`
`).map(e=>({type:"p",children:e?[{type:"text",text:e}]:[{type:"br"}]}))});export{r as a,m as b,p as c,l as d};
