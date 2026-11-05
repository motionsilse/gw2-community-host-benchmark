import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {initialModules} from './community-entry.mjs';

export async function communityBundles(root,{write=true}={}){
  const outputs={},locales={},posts={},files=[];
  for(const locale of ['ko','en']){
    const result=await build({absWorkingDir:root,entryPoints:['public/community/app.js'],outdir:'public/community/build/'+locale,
      entryNames:'[name]-[hash]',bundle:true,splitting:true,format:'esm',target:['es2022'],charset:'utf8',minify:true,legalComments:'linked',metafile:true,write,
      define:{__COMMUNITY_LOCALE__:JSON.stringify(locale)},plugins:[{name:'selected-locale',setup(plugin){
        if(locale==='ko')plugin.onLoad({filter:/messages-en\.js$/},()=>({contents:'export const english={};',loader:'js'}));
        plugin.onLoad({filter:/guide-navigation\.json$/},async({path})=>{
          const data=JSON.parse(await readFile(path,'utf8'));return {contents:JSON.stringify({...data,navigation:{[locale]:data.navigation[locale]}}),loader:'json'};
        });
      }}]});
    Object.assign(outputs,result.metafile.outputs);files.push(...result.outputFiles||[]);
    const entry=Object.entries(result.metafile.outputs).find(([,meta])=>meta.entryPoint==='public/community/app.js')[0];
    locales[locale]=initialModules(outputs,entry);
    const post=Object.entries(result.metafile.outputs).find(([,meta])=>meta.entryPoint==='public/community/thread.js')[0];
    posts[locale]=initialModules(outputs,post).filter(file=>!locales[locale].includes(file));
  }
  const entries=Object.fromEntries(Object.entries(locales).map(([locale,modules])=>[locale,modules.map(file=>'/'+file.replace(/^public\//,''))]));
  const postEntries=Object.fromEntries(Object.entries(posts).map(([locale,modules])=>[locale,modules.map(file=>'/'+file.replace(/^public\//,''))]));
  const boot=await build({absWorkingDir:root,entryPoints:['public/community/boot.js'],bundle:true,format:'iife',target:['es2022'],charset:'utf8',minify:true,write:false,define:{__COMMUNITY_ENTRIES__:JSON.stringify(entries),__COMMUNITY_POST_ENTRIES__:JSON.stringify(postEntries)}});
  return {outputs,locales,posts,files,bootstrap:boot.outputFiles[0].text};
}
