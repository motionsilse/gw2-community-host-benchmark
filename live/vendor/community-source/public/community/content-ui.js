import {t} from './i18n.js';
import {notify} from './ui.js';
import PhotoSwipe from 'photoswipe';
export {cleanHtml,readImages,contentHtml} from './content-render.js';
function imageSize(image){
  const width=Number(image.getAttribute('width')),height=Number(image.getAttribute('height'));
  return image.hasAttribute('data-original-src')&&width&&height?{width,height}:{width:image.naturalWidth||width,height:image.naturalHeight||height};
}
function waitForImage(image,signal){
  return new Promise((resolve,reject)=>{
    const finish=error=>{image.removeEventListener('load',load);image.removeEventListener('error',fail);signal.removeEventListener('abort',abort);error?reject(error):resolve();};
    const load=()=>finish(image.naturalWidth?null:Error('Image unavailable')),fail=()=>finish(Error('Image unavailable')),abort=()=>finish(signal.reason);
    image.addEventListener('load',load,{once:true});image.addEventListener('error',fail,{once:true});signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted)abort();else if(image.complete)load();
  });
}
function cancellable(promise,signal){
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
    promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
    if(signal.aborted)abort();
  });
}
async function loadOriginalImage(src,{signal}){
  signal.throwIfAborted();const image=document.createElement('img');image.decoding='async';
  image.setAttribute('fetchpriority','high');image.src=src;
  const abort=()=>image.removeAttribute('src');signal.addEventListener('abort',abort,{once:true});
  try{await waitForImage(image,signal);return image;}
  finally{signal.removeEventListener('abort',abort);}
}
export function imageViewer(host,{Viewer,loadViewer,loadOriginal=loadOriginalImage}={}){
  let active=null,opening=false,alive=true,generation=0,pending;
  const cleanup=[];
  const navigate=()=>{generation++;pending?.abort();active?.destroy();};
  const warm=()=>{if(alive&&!Viewer&&loadViewer)loadViewer().catch(()=>{});};
  for(const image of host.querySelectorAll('.prose img')){
    if(image.closest('a,button'))continue;
    const originalSrc=image.getAttribute('data-original-src');
    let originalImage,originalLoading,originalController;
    const fullImage=()=>{
      if(originalImage)return Promise.resolve(originalImage);
      if(!originalLoading){
        originalController=new AbortController();const signal=originalController.signal;
        const timeout=setTimeout(()=>originalController?.abort(Error('Image download timed out')),30000);
        originalLoading=cancellable(loadOriginal(originalSrc,{signal}),signal).then(full=>{
          signal.throwIfAborted();originalImage=full;return full;
        }).finally(()=>{clearTimeout(timeout);originalLoading=null;});
      }
      return originalLoading;
    };
    const button=document.createElement('button');button.className='image-open';button.type='button';button.setAttribute('aria-label',t("이미지 확대: ")+(image.alt||t("첨부 이미지")));image.replaceWith(button);button.append(image);
    let loadingLabel;
    const ready=()=>{loadingLabel?.remove();button.classList.remove('image-pending');};
    if(!image.complete){
      button.classList.add('image-pending');loadingLabel=document.createElement('span');loadingLabel.className='image-load-status';loadingLabel.textContent=t('이미지 불러오는 중…');button.append(loadingLabel);
      image.addEventListener('load',ready,{once:true});
    }
    const unavailable=()=>{
      ready();
      image.hidden=true;button.disabled=true;button.classList.add('image-unavailable');
      const label=document.createElement('span');label.textContent=image.alt?t("이미지를 불러올 수 없습니다: ")+image.alt:t("이미지를 불러올 수 없습니다.");button.setAttribute('aria-label',label.textContent);button.append(label);
      if(!host.querySelector('.image-read-notice')){
        const note=document.createElement('p');note.className='image-read-notice draft-note';note.setAttribute('role','status');note.textContent=t("이미지 표시가 일시 중단되었거나 연결되지 않았습니다. 글과 댓글은 계속 이용할 수 있습니다.");(host.querySelector('.prose')||host).prepend(note);
      }
    };
    if(image.complete&&!image.naturalWidth)unavailable();else image.addEventListener('error',unavailable,{once:true});
    // Optional injected loaders can warm after an image is ready. Production
    // already has PhotoSwipe in the on-demand thread bundle.
    if(image.complete&&image.naturalWidth)warm();else image.addEventListener('load',warm,{once:true});
    cleanup.push(()=>{originalController?.abort();originalImage?.remove();button.onclick=null;image.removeEventListener('load',warm);image.removeEventListener('load',ready);image.removeEventListener('error',unavailable);});
    button.onclick=async()=>{
      if(active||opening||!alive)return;
      opening=true;const version=generation;button.setAttribute('aria-busy','true');
      const controller=new AbortController();pending=controller;
      const status=document.createElement('span');status.className='image-opening';status.setAttribute('role','status');status.textContent=t('이미지 여는 중…');button.append(status);
      const cancel=event=>{if(event.key==='Escape')controller.abort();};window.addEventListener('keydown',cancel);
      const timeout=setTimeout(()=>controller.abort(Error('Image opening timed out')),15000);
      window.addEventListener('hashchange',navigate,{once:true});
      try{
        image.setAttribute('loading','eager');
        // PhotoSwipe is part of the on-demand thread bundle, not the listing.
        // A rendered image therefore never waits for another module on click.
        const View=Viewer||(loadViewer?await cancellable(loadViewer(),controller.signal):PhotoSwipe);
        if(!imageSize(image).width||!imageSize(image).height)await waitForImage(image,controller.signal);
        controller.signal.throwIfAborted();
        if(!alive||version!==generation||!button.isConnected)return;
        const {width,height}=imageSize(image);
        const original={style:image.getAttribute('style'),className:image.getAttribute('class')},slot=document.createElement('span');
        slot.className='image-viewer-placeholder';slot.setAttribute('aria-hidden','true');
        slot.style.width=image.width+'px';slot.style.height=image.height+'px';
        const viewer=new View({dataSource:[{src:image.src,width,height,alt:image.alt}],
          initialZoomLevel:'fit',secondaryZoomLevel:1,maxZoomLevel:2,
          padding:{top:76,bottom:64,left:16,right:16},bgOpacity:0.96,showHideAnimationType:'none',
          wheelToZoom:true,closeOnVerticalDrag:false,pinchToClose:false,
          tapAction:'zoom',doubleTapAction:false,imageClickAction:'zoom',
          arrowPrev:false,arrowNext:false,counter:false,preload:[0,0],preloaderDelay:0,
          closeTitle:t('닫기'),zoomTitle:t('확대 / 화면에 맞춤'),errorMsg:t('이미지를 불러올 수 없습니다.')});
        button.insertBefore(slot,image);
        active=viewer;let content,loaded,failed;
        const pageStyle=document.documentElement.style,overflow=pageStyle.getPropertyValue('overflow'),overflowPriority=pageStyle.getPropertyPriority?.('overflow')||'';
        pageStyle.setProperty('overflow','hidden');
        viewer.on('bindEvents',()=>{
          viewer.element.setAttribute('aria-modal','true');viewer.element.setAttribute('aria-label',button.getAttribute('aria-label'));
          const hint=document.createElement('p');hint.className='image-viewer-hint';hint.textContent=t('확대 버튼으로 확대 · 끌어서 이동');viewer.element.append(hint);
          if(originalSrc&&/^\/media\/[0-9a-f-]{36}$/.test(originalSrc)){
            const detail=document.createElement('div');detail.className='image-detail-status';detail.setAttribute('role','status');viewer.element.append(detail);
            const upgrade=()=>{
              detail.hidden=false;detail.textContent=t('고해상도 이미지 불러오는 중…');
              fullImage().then(full=>{
                if(!alive||active!==viewer||version!==generation||!content)return;
                if(loaded)image.removeEventListener('load',loaded);if(failed)image.removeEventListener('error',failed);
                full.alt=image.alt;full.className=image.className;
                const style=image.getAttribute('style');style===null?full.removeAttribute('style'):full.setAttribute('style',style);
                image.replaceWith(full);content.element=full;
                if(content.state==='loading')content.onLoaded();detail.hidden=true;
              }).catch(()=>{
                if(!alive||active!==viewer||version!==generation)return;
                detail.textContent=t('고해상도 이미지를 불러오지 못했습니다.');
                const retry=document.createElement('button');retry.type='button';retry.textContent=t('다시 시도');retry.onclick=upgrade;detail.append(retry);
              });
            };
            upgrade();
          }
        });
        // Explicitly cycle at both ends; a focusin guard cannot catch focus
        // leaving the document for browser chrome at the end of the Tab order.
        viewer.on('keydown',event=>{
          const key=event.originalEvent;if(key.key!=='Tab')return;
          const buttons=[...viewer.element.querySelectorAll('button:not([disabled]):not([hidden])')].filter(button=>button.style.display!=='none'&&(!button.getClientRects||button.getClientRects().length>0));
          const target=key.shiftKey?buttons.at(-1):buttons[0],edge=key.shiftKey?buttons[0]:buttons.at(-1);
          if(target&&(document.activeElement===edge||!buttons.includes(document.activeElement))){key.preventDefault();event.preventDefault();target.focus();}
        });
        viewer.on('contentLoad',event=>{
          event.preventDefault();content=event.content;image.remove();content.element=image;image.classList.add('pswp__img');
          if(image.complete&&image.naturalWidth)content.onLoaded();
          else{
            content.state='loading';loaded=()=>content.onLoaded();failed=()=>content.onError();
            image.addEventListener('load',loaded,{once:true});image.addEventListener('error',failed,{once:true});
          }
        });
        // setDisplayedSize normally assigns src again. Keep the already-loading
        // or decoded node: no revalidation or transfer on open.
        viewer.on('contentLoadImage',event=>event.preventDefault());
        viewer.on('destroy',()=>{
          window.removeEventListener('hashchange',navigate);
          overflow?pageStyle.setProperty('overflow',overflow,overflowPriority):pageStyle.removeProperty('overflow');
          if(loaded)image.removeEventListener('load',loaded);if(failed)image.removeEventListener('error',failed);
          // PhotoSwipe destroys its contents after this event. Release ownership
          // before restoring the node so its cleanup cannot remove the post image.
          if(content)content.element=undefined;
          originalImage?.remove();
          for(const [attribute,value] of [['style',original.style],['class',original.className]])value===null?image.removeAttribute(attribute):image.setAttribute(attribute,value);
          slot.replaceWith(image);active=null;if(button.isConnected)button.focus?.({preventScroll:true});
        });
        try{viewer.init();}catch(error){viewer.destroy();throw error;}
      }catch(error){if(error?.name!=='AbortError'&&alive&&version===generation)notify(t('이미지 확대를 불러오지 못했습니다. 다시 시도해 주세요.'));}
      finally{clearTimeout(timeout);window.removeEventListener('keydown',cancel);pending=null;status.remove();opening=false;button.removeAttribute('aria-busy');if(!active)window.removeEventListener('hashchange',navigate);}
    };
  }
  return ()=>{alive=false;pending?.abort();window.removeEventListener('hashchange',navigate);for(const dispose of cleanup)dispose();active?.destroy();};
}
