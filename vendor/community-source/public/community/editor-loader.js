import {t} from './i18n.js';

export const editorBase='/vendor/tinymce';
export const editorPlugins='autoresize autolink lists link image table';
export const editorPostCss='/community/content.css';
export const editorFontCss='/vendor/fonts/noto/index.css';
const scripts=['icons/default/icons.min.js','models/dom/model.min.js','themes/silver/theme.min.js',
  ...editorPlugins.split(' ').map(plugin=>`plugins/${plugin}/plugin.min.js`)].map(file=>editorBase+'/'+file);
const styles=[editorFontCss,editorBase+'/skins/ui/oxide/skin.min.css'];
let loading,preloaded=false;

export function loadEditor(){
  if(loading)return loading;
  if(globalThis.tinymce)return Promise.resolve();
  return loading=new Promise((resolve,reject)=>{
    // Register the skin's iframe CSS once. A preload in the outer document
    // is not reused by the iframe's stylesheet request on a cold visit.
    const frameSkin=fetch(editorBase+'/skins/ui/oxide/content.min.css',{priority:'low',signal:AbortSignal.timeout(10000)})
      .then(response=>response.ok?response.text():null).catch(()=>null);
    const script=document.createElement('script');
    script.src=editorBase+'/tinymce.min.js';
    script.fetchPriority='low';
    script.onload=async()=>{
      const css=await frameSkin;
      try{if(css)globalThis.tinymce?.Resource?.add('ui/oxide/content.css',css);}
      catch{} // TinyMCE can still load the stylesheet itself.
      resolve();
    };
    script.onerror=()=>{loading=null;reject(Error(t("편집기를 불러오지 못했습니다. 작성 내용은 남아 있습니다. 새로고침해 주세요.")));};
    document.head.append(script);
    if(!preloaded){
      preloaded=true;
      // Start TinyMCE's dependencies while its core is still downloading.
      for(const [as,urls] of [['script',scripts],['style',styles]]){
        for(const file of urls){
          const link=document.createElement('link');
          link.rel='preload';link.as=as;link.href=file;link.fetchPriority='low';
          document.head.append(link);
        }
      }
    }
  });
}
