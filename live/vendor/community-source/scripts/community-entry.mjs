// Derive hints from the actual bundle graph, never from stale files in outdir.
export function inlineEntryStyles(html,styles){
  for(const {href,css} of styles){
    // These local styles contain no assets. Reject new relative references
    // instead of silently resolving them against the document's URL.
    if(!/^\/community\/[\w-]+\.css$/.test(href)||/@import\b|url\s*\(|<\/style/i.test(css))throw Error('Unsafe entry style: '+href);
    const link=`<link rel="stylesheet" href="${href}">`;
    if(html.split(link).length!==2)throw Error('Expected one entry stylesheet: '+href);
    html=html.replace(link,()=>`<style data-entry-style="${href}">${css}</style>`);
  }
  return html;
}
export function initialModules(outputs,entry='public/community/build/app.js'){
  const seen=new Set();
  function visit(file){
    if(seen.has(file))return;
    if(!outputs[file])throw Error('Missing initial bundle: '+file);
    seen.add(file);
    for(const item of outputs[file].imports||[])if(item.kind==='import-statement'&&!item.external)visit(item.path);
  }
  visit(entry);return [...seen];
}
export function entryHtml(html,outputs){
  const links=initialModules(outputs).slice(1).map(file=>`  <link rel="modulepreload" href="/${file.replace(/^public\//,'')}">`).join('\n');
  const entry=/<script\b(?=[^>]*\btype="module")(?=[^>]*\bsrc="\/community\/build\/app\.js")[^>]*>/g;
  if([...html.matchAll(entry)].length!==1)throw Error('Expected one community entry script');
  return html.replace(entry,tag=>links+'\n'+tag);
}
export function localizedEntryHtml(html,bootstrap){
  const tag='<script type="module" src="/community/build/app.js"></script>';
  if(html.split(tag).length!==2||/<\/script/i.test(bootstrap))throw Error('Invalid localized entry');
  return html.replace(tag,()=>'<script data-community-boot>'+bootstrap+'</script>');
}
export function assetHeaders(headers,outputs){
  const base=headers.replace(/\n# BEGIN COMMUNITY BUILD CACHE[\s\S]*?# END COMMUNITY BUILD CACHE\s*$/,'').trimEnd();
  const rules=Object.keys(outputs).filter(file=>/^public\/community\/build\/(?:ko\/|en\/)?[\w-]+-[A-Z0-9]{8}\.js$/.test(file))
    .map(file=>`/${file.replace(/^public\//,'')}\n  Cache-Control: public, max-age=31536000, immutable`).join('\n');
  return base+'\n\n# BEGIN COMMUNITY BUILD CACHE\n'+rules+'\n# END COMMUNITY BUILD CACHE\n';
}
