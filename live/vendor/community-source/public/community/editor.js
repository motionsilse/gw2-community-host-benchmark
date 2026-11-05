import {t,locale} from './i18n.js';
import {validateFile} from './images.js';
import {inspectImageHeader} from './image-header.js';
import {FONT_SIZES,fontSizeFromCSS} from '../../src/community-font-sizes.js';
import {loadEditor,editorBase,editorPlugins,editorPostCss,editorFontCss} from './editor-loader.js';
const dataURL=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error(t("이미지를 읽지 못했습니다.")));reader.readAsDataURL(file);});
const storedImage=source=>/^\/(?:media\/[0-9a-f-]{36}|api\/files\/[1-9]\d*)$/.test(source);
function restoredStoredImage(source){
  const origin=globalThis.location?.origin||'https://community.invalid';
  let url;try{url=new URL(source,origin);}catch{return null;}
  if(url.origin!==origin||url.username||url.password||url.hash||!storedImage(url.pathname))return null;
  if(url.search&&(!url.pathname.startsWith('/media/')||!/^\?preview=(?:640|1280)$/.test(url.search)))return null;
  return url.pathname;
}
function inlineFile(source){
  const match=/^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=\s]+)$/i.exec(source);
  if(!match)throw Error(t("이미지 파일의 형식이나 크기 정보를 확인할 수 없습니다."));
  if(match[2].length>Math.ceil(20*1024**2/3)*4)throw Error(t("원본 이미지는 20MB 이하로 선택해 주세요."));
  let bytes;try{bytes=Uint8Array.from(atob(match[2]),char=>char.charCodeAt(0));}catch{throw Error(t("이미지 파일의 형식이나 크기 정보를 확인할 수 없습니다."));}
  return new Blob([bytes],{type:match[1].toLowerCase()});
}
function imageTemplate(html){
  // Templates are inert: inspecting pasted/restored sources must not load them.
  const template=document.createElement('template');template.innerHTML=html;
  for(const node of template.content.querySelectorAll('source,svg,math,object,embed,iframe,script,style,video,audio,link,input'))node.remove();
  for(const node of template.content.querySelectorAll('*')){
    const size=node.tagName==='SPAN'?(fontSizeFromCSS(node.style.fontSize)??fontSizeFromCSS(node.getAttribute('data-font-size')+'px')):null;
    for(const attribute of [...node.attributes]){
      if(['style','srcset','data-original-src','poster','background','lowsrc','dynsrc'].includes(attribute.name)||attribute.name.startsWith('data-mce-')||attribute.name==='src'&&node.tagName!=='IMG')node.removeAttribute(attribute.name);
    }
    node.removeAttribute('data-font-size');
    if(size!==null)node.setAttribute('style',`font-size:${size}px`);
  }
  return template;
}

export async function createEditor(element,{html='',files=[],maxImages=20,onChange,upload,signal}){
  await loadEditor();
  signal?.throwIfAborted();
  const tiny=globalThis.tinymce;
  tiny.addI18n('ko_community',{
    'Failed to upload image: {0}':'이미지 첨부 안내: {0}',
    'Font size':'글자 크기','Font sizes':'글자 크기','Font size {0}':'글자 크기 {0}',
    'Upload':'첨부','Caption':'이미지 아래 설명','Use arrow keys to navigate.':'방향키로 표 크기를 선택하세요.','{0} columns, {1} rows':'{0}열, {1}행',
    'Undo':'실행 취소','Redo':'다시 실행','Bold':'굵게','Italic':'기울임','Strikethrough':'취소선','Blocks':'문단','Paragraph':'본문','Headings':'제목','Heading 2':'소제목','Heading 3':'작은 제목','Blockquote':'인용','Bullet list':'글머리 목록','Numbered list':'번호 목록',
    'Insert/edit link':'링크 삽입/수정','Insert link':'링크 삽입','Link...':'링크','Text to display':'표시할 글자','Open link in...':'링크 열기','Current window':'현재 창','New window':'새 창','None':'없음','Title':'제목','Url':'주소','URL':'주소','Save':'저장','Cancel':'취소','Ok':'확인','Close':'닫기',
    'Table':'표','Table properties':'표 설정','Insert table':'표 삽입','Row':'행','Column':'열','Cell':'셀','Delete table':'표 삭제','Insert row before':'위에 행 삽입','Insert row after':'아래에 행 삽입','Delete row':'행 삭제','Insert column before':'왼쪽에 열 삽입','Insert column after':'오른쪽에 열 삽입','Delete column':'열 삭제','Merge cells':'셀 합치기','Split cell':'셀 나누기',
    'Image':'이미지','Insert/edit image':'이미지 설정','General':'기본','Source':'이미지 주소','Alternative description':'이미지 설명','Dimensions':'크기','Width':'너비','Height':'높이','Constrain proportions':'비율 유지','Show caption':'설명 표시','Advanced':'고급','Image is decorative':'장식용 이미지','Rich Text Area':'글 본문','More...':'더보기','Select all':'전체 선택','Cut':'잘라내기','Copy':'복사','Paste':'붙여넣기','Paste as text':'서식 없이 붙여넣기','Formats':'서식','Align left':'왼쪽 정렬','Align center':'가운데 정렬','Align right':'오른쪽 정렬','Block {0}':'문단 {0}','Block':'문단','Reveal or hide additional toolbar items':'추가 도구 열기/닫기','Element Path':'현재 문단'
  });
  const fileInput=document.createElement('input');Object.assign(fileInput,{type:'file',accept:'image/png,image/jpeg,image/webp',multiple:true,hidden:true});element.after(fileInput);
  const restored=new Map(),checkedSources=new Set(),detach=[];let bookmark,destroyed=false,readingFiles=0,readOnly=true,insertionQueue=Promise.resolve();
  const report=error=>{if(!destroyed)editor.notificationManager.open({text:error.message,type:'error'});};
  const enqueue=work=>{
    readingFiles++;onChange();
    const pending=insertionQueue.then(()=>{if(!destroyed)return work();}).catch(report).finally(()=>{readingFiles--;if(!destroyed)onChange();});
    insertionQueue=pending;return pending;
  };
  const inlinePostCss=document.querySelector(`style[data-entry-style="${editorPostCss}"]`)?.textContent;
  const [editor]=await tiny.init({
    target:element,license_key:'gpl',base_url:editorBase,suffix:'.min',language:locale==='ko'?'ko_community':'en',readonly:true,
    plugins:editorPlugins,menubar:false,promotion:false,branding:true,statusbar:true,contextmenu:'link table',
    link_default_target:'_blank',link_target_list:false,
    toolbar:'localImage | fontsize | bold italic strikethrough | blocks | bullist numlist | link table blockquote | undo redo',
    font_size_formats:FONT_SIZES.map(size=>size+'px').join(' '),font_size_input_default_unit:'px',
    toolbar_sticky:true,toolbar_mode:'sliding',block_formats:t("본문=p;소제목=h2;작은 제목=h3"),
    min_height:Math.max(460,Math.round(innerHeight*.62)),autoresize_bottom_margin:36,autoresize_overflow_padding:innerWidth<760?18:32,resize:false,
    content_css:inlinePostCss?[editorFontCss]:[editorPostCss,editorFontCss],content_style:inlinePostCss||'',
    iframe_aria_text:t("글 본문"),placeholder:t("내용을 입력하세요. 이미지는 Ctrl+V로 바로 붙여넣을 수 있어요."),
    paste_data_images:false,automatic_uploads:true,images_file_types:'jpg,jpeg,png,webp',images_reuse_filename:false,
    images_upload_handler:info=>upload(info.blob(),{source:info.blobUri(),...restored.get(info.blobUri())}).catch(error=>Promise.reject({message:error.message,remove:true})),
    image_caption:true,image_dimensions:false,relative_urls:false,remove_script_host:true,convert_urls:true,
    extended_valid_elements:'figure[class|data-media-id|data-width|data-align],figcaption',
    table_default_attributes:{},table_default_styles:{},table_advtab:false,table_cell_advtab:false,table_row_advtab:false,
    setup(instance){
      const selectedFigure=()=>{
        const node=instance.selection.getNode(),image=node.nodeName==='IMG'?node:node.querySelector?.('img');if(!image)return null;
        let figure=image.closest('figure');
        if(!figure){figure=instance.dom.create('figure',{'class':'image'});image.replaceWith(figure);figure.append(image);}
        return figure;
      };
      instance.ui.registry.addButton('localImage',{text:t("이미지"),icon:'image',tooltip:t("이미지 추가"),onAction:()=>{bookmark=instance.selection.getBookmark(2,true);fileInput.click();}});
      instance.ui.registry.addButton('imageDescription',{icon:'edit-block',tooltip:t("이미지 설명"),onAction:()=>{
        const node=instance.selection.getNode(),image=node.nodeName==='IMG'?node:node.querySelector?.('img');if(!image)return;
        instance.windowManager.open({title:t("이미지 설명"),body:{type:'panel',items:[{type:'input',name:'alt',label:t("이미지를 읽을 수 없을 때의 설명")},{type:'textarea',name:'caption',label:t("이미지 아래에 표시할 설명")}]},initialData:{alt:image.getAttribute('alt')||'',caption:image.closest('figure')?.querySelector('figcaption')?.textContent||''},buttons:[{type:'cancel',text:t("취소")},{type:'submit',text:t("저장"),primary:true}],onSubmit:dialog=>{
          const values=dialog.getData();instance.undoManager.transact(()=>{
            instance.dom.setAttrib(image,'alt',values.alt);
            let figure=image.closest('figure');
            if(values.caption.trim()&&!figure){figure=instance.dom.create('figure',{'class':'image'});image.replaceWith(figure);figure.append(image);}
            let caption=figure?.querySelector('figcaption');
            if(values.caption.trim()){if(!caption){caption=instance.dom.create('figcaption');figure.append(caption);}caption.textContent=values.caption;}
            else caption?.remove();
            instance.nodeChanged();onChange();
          });dialog.close();
        }});
      }});
      for(const width of [50,75,100])instance.ui.registry.addButton('imageWidth'+width,{text:width+'%',tooltip:t("본문 폭의 {width}%",{width}),onAction:()=>instance.undoManager.transact(()=>{const figure=selectedFigure();if(figure){figure.dataset.width=String(width);instance.nodeChanged();onChange();}})});
      for(const [align,label] of [['left',t("왼쪽")],['center',t("가운데")],['right',t("오른쪽")]])instance.ui.registry.addButton('imageAlign'+align,{text:label,tooltip:t("이미지 {align} 정렬",{align:label}),onAction:()=>instance.undoManager.transact(()=>{const figure=selectedFigure();if(figure){figure.dataset.align=align;instance.nodeChanged();onChange();}})});
      instance.ui.registry.addContextToolbar('communityImage',{predicate:node=>node.nodeName==='IMG'||node.nodeName==='FIGURE'&&!!node.querySelector('img'),items:'imageDescription imageWidth50 imageWidth75 imageWidth100 | imageAlignleft imageAligncenter imageAlignright',position:'node',scope:'node'});
      instance.on('input change undo redo SetContent',onChange);
      instance.on('init',()=>{
        const doc=instance.getDoc(),dragType='application/x-gw2-community-drag';let internalDrag=null;
        const dragStart=event=>{
          internalDrag=null;if(readOnly||event.defaultPrevented||!instance.getBody().contains(event.target)||!event.dataTransfer)return;
          const token=crypto.randomUUID(),image=event.target.closest?.('img')||(event.target.tagName==='FIGURE'?event.target.querySelector('img'):null);
          const source=image?.getAttribute('src'),node=image&&(checkedSources.has(source)||storedImage(source))?(image.closest('figure')||image):null;
          try{event.dataTransfer.setData(dragType,token);}catch{return;}
          internalDrag={event,token,node};
          queueMicrotask(()=>{if(internalDrag?.event===event&&event.defaultPrevented)internalDrag=null;});
        };
        const dragEnd=()=>{internalDrag=null;};
        const dropRange=event=>{
          const range=doc.caretRangeFromPoint?.(event.clientX,event.clientY);if(range)return range;
          const position=doc.caretPositionFromPoint?.(event.clientX,event.clientY);if(!position)return null;
          const caret=doc.createRange();caret.setStart(position.offsetNode,position.offset);caret.collapse(true);return caret;
        };
        const capture=event=>{
          const drag=event.type==='drop'?internalDrag:null;
          if(event.type==='drop')internalDrag=null;
          const transfer=event.clipboardData||event.dataTransfer;if(!transfer)return;
          const fromEditor=drag&&!drag.event.defaultPrevented&&transfer.getData(dragType)===drag.token;
          let selected=[...(transfer.files||[])];
          if(!selected.length)selected=[...(transfer.items||[])].filter(item=>item.kind==='file').map(item=>item.getAsFile()).filter(Boolean);
          if(fromEditor&&!readOnly&&!destroyed&&!event.ctrlKey&&!event.metaKey){
            if(drag.node){
              // Chromium can represent an internal image drag as a new File
              // with dropEffect=copy. Move the checked node itself; letting the
              // file paste path handle it would decode and upload a duplicate.
              event.preventDefault();event.stopImmediatePropagation();
              const range=dropRange(event),node=drag.node;
              if(!range||!instance.getBody().contains(node)||node.contains(range.startContainer))return;
              instance.undoManager.transact(()=>{range.insertNode(node);instance.selection.select(node);instance.selection.collapse(false);instance.nodeChanged();onChange();});
              instance.focus();return;
            }
            if(!selected.length)return;
          }
          const html=transfer.getData('text/html')||'';
          if(!selected.length&&!/<(?:img|picture|source|svg)\b/i.test(html))return;
          event.preventDefault();event.stopImmediatePropagation();if(readOnly||destroyed)return;
          if(event.type==='drop'){
            const range=dropRange(event);
            if(range)instance.selection.setRng(range);
          }
          const position=instance.selection.getBookmark(2,true);
          if(selected.length)enqueue(()=>insertFiles(selected,position));
          else enqueue(async()=>{const value=await prepareHTML(html,{slots:maxImages-imageCount()});if(!destroyed){instance.focus();instance.selection.moveToBookmark(position);instance.insertContent(value,{paste:true});}});
        };
        for(const [name,handler] of [['dragstart',dragStart],['dragend',dragEnd]]){doc.addEventListener(name,handler,true);detach.push(()=>doc.removeEventListener(name,handler,true));}
        for(const name of ['paste','drop']){doc.addEventListener(name,capture,true);detach.push(()=>doc.removeEventListener(name,capture,true));}
      });
      instance.on('PastePreProcess',event=>{
        const template=imageTemplate(event.content);
        const current=document.createElement('template');current.innerHTML=instance.getContent();
        let slots=Math.max(0,maxImages-current.content.querySelectorAll('img').length);
        for(const image of template.content.querySelectorAll('img')){
          const src=image.getAttribute('src')||'';
          if(!checkedSources.has(src)&&!storedImage(src)){image.replaceWith(document.createTextNode(t("[외부 이미지는 이미지 파일로 복사해 붙여넣어 주세요.]")));continue;}
          if(slots--<=0)image.replaceWith(document.createTextNode('['+t("이미지는 최대 {count}장까지 첨부할 수 있습니다.",{count:maxImages})+']'));
        }
        event.content=template.innerHTML;
      });
    }
  });
  async function cacheFile(file,metadata){
    validateFile(file);await inspectImageHeader(file);if(destroyed)return null;
    const data=await dataURL(file);if(destroyed)return null;
    const cache=editor.editorUpload.blobCache,info=cache.create(crypto.randomUUID(),file,data.split(',')[1]);cache.add(info);
    checkedSources.add(info.blobUri());if(metadata)restored.set(info.blobUri(),metadata);return info.blobUri();
  }
  async function prepareHTML(value,{saved=[],slots=maxImages,restoring=false}={}){
    const template=imageTemplate(value),prepared=new Map();
    const images=template.content.querySelectorAll('img');
    if(restoring)slots=Math.max(slots,images.length);
    for(const figure of template.content.querySelectorAll('figure:has(img)'))figure.classList.add('image');
    for(const image of images){
      try{
        if(slots<=0)throw Error(t("이미지는 최대 {count}장까지 첨부할 수 있습니다.",{count:maxImages}));
        const source=image.getAttribute('src')||'',file=saved.find(file=>file.source===source);
        let checked=prepared.get(source);
        if(!checked){
          if(file?.url&&storedImage(file.url))checked=file.url;
          else if(file?.blob)checked=await cacheFile(file.blob,{id:file.id,optimized:file.optimized,width:file.width,height:file.height,originalSize:file.originalSize});
          else if(checkedSources.has(source)||storedImage(source))checked=source;
          else if(source.startsWith('data:'))checked=await cacheFile(inlineFile(source));
          else{
            checked=restoring?restoredStoredImage(source):null;
            if(!checked)throw Error(t("[보관되지 않은 이미지입니다. 다시 첨부해 주세요.]"));
          }
          if(destroyed)return '';prepared.set(source,checked);
        }
        image.setAttribute('src',checked);
        // Keep the original reference for saving and use the smaller file in the editor.
        if(restoring&&checked.startsWith('/media/')&&Math.max(Number(image.getAttribute('width')),Number(image.getAttribute('height')))>700)image.setAttribute('srcset',checked+'?preview=640');
        slots--;
      }catch(error){image.replaceWith(document.createTextNode('['+error.message+']'));report(error);}
    }
    return template.innerHTML;
  }
  const destroy=()=>{
    if(destroyed)return;
    destroyed=true;signal?.removeEventListener('abort',destroy);
    for(const stop of detach)stop();
    editor.remove();fileInput.remove();
  };
  if(signal?.aborted){destroy();signal.throwIfAborted();}
  signal?.addEventListener('abort',destroy,{once:true});
  async function insertFiles(selected,position){
    let positioned=false;
    for(const file of selected){
      try{
        if(imageCount()>=maxImages)throw Error(t("이미지는 최대 {count}장까지 첨부할 수 있습니다.",{count:maxImages}));const source=await cacheFile(file);if(destroyed)return;
        editor.focus();if(!positioned&&position)editor.selection.moveToBookmark(position);positioned=true;
        editor.insertContent(`<p><img src="${source}" alt=""></p><p></p>`);
      }catch(error){report(error);}
    }
  }
  // The editor initializes empty before header checks finish. Seed history
  // with the restored document so the first undo cannot return to that empty state.
  // A lower account limit must not remove already saved images on reopening.
  await enqueue(async()=>{const safe=await prepareHTML(html,{saved:files,restoring:true});if(!destroyed)editor.resetContent(safe);});
  // The initial restore may read several saved image blobs. Do not accept text
  // edits into the empty document that resetContent is about to replace.
  if(!destroyed){readOnly=false;editor.mode.set('design');}
  fileInput.onchange=()=>{
    const selected=[...fileInput.files],position=bookmark;fileInput.value='';if(readOnly||destroyed)return;
    return enqueue(()=>insertFiles(selected,position));
  };
  function imageCount(){const body=document.createElement('template');body.innerHTML=editor.getContent();return body.content.querySelectorAll('img').length;}
  // Normal HTML serialization replaces pending blob URLs with data URLs. Keep
  // their identity so retries and saved file bytes still match the draft HTML.
  return {html:()=>editor.getContent({format:'raw'}),imageCount,get pending(){return readingFiles>0;},setHtml:value=>enqueue(async()=>{const safe=await prepareHTML(value);if(!destroyed)editor.setContent(safe);}),setReadOnly:value=>{readOnly=value;fileInput.disabled=value;editor.mode.set(value?'readonly':'design');},focus:()=>editor.focus(),destroy};
}
