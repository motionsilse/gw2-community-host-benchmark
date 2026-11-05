import {t} from './i18n.js';
import {inspectImageHeader} from './image-header.js';
export const sizeText=n=>n>=1024**2?`${(n/1024**2).toFixed(1)}MB`:`${Math.round(n/1024)}KB`;
const OUTPUT_LIMIT=2*1024**2;
export function validateFile(file){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error(t("PNG, JPG, WebP 이미지를 선택해 주세요."));
  if(!file.size||file.size>20*1024**2)throw Error(t("원본 이미지는 20MB 이하로 선택해 주세요."));
}
const encode=(canvas,type,quality)=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error(t("이미지를 변환하지 못했습니다."))),type,quality));
export async function optimize(file){
  validateFile(file);await inspectImageHeader(file);const bitmap=await createImageBitmap(file);
  try{
    if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>24000000)throw Error(t("이미지는 2,400만 화소 이하로 선택해 주세요."));
    const ratio=Math.min(1,2560/Math.max(bitmap.width,bitmap.height)),width=Math.max(1,Math.round(bitmap.width*ratio)),height=Math.max(1,Math.round(bitmap.height*ratio));
    const canvas=document.createElement('canvas');Object.assign(canvas,{width,height});canvas.getContext('2d').drawImage(bitmap,0,0,width,height);
    const png=await encode(canvas,'image/png'),webp=await encode(canvas,'image/webp',.92);let blob=png.size<=webp.size?png:webp;
    if(blob.size>OUTPUT_LIMIT)blob=await encode(canvas,'image/webp',.82);
    if(blob.size>OUTPUT_LIMIT)throw Error(t("최적화 후에도 2MB를 넘습니다. 이미지 영역을 줄여 다시 첨부해 주세요."));
    return {blob,width,height,originalSize:file.size};
  }finally{bitmap.close();}
}
export class ImagePipeline{
  constructor(onChange,{send,optimizeImage=optimize,maxImages=20,referenceCount=()=>null,isReferenced=()=>true}){this.onChange=onChange;this.send=send;this.optimize=optimizeImage;this.maxImages=maxImages;this.referenceCount=referenceCount;this.isReferenced=isReferenced;this.jobs=[];this.queue=Promise.resolve();}
  get pending(){return this.jobs.some(job=>!['done','cancelled'].includes(job.status));}
  upload(file,{source,id=crypto.randomUUID(),optimized,width,height,originalSize}={}){
    const count=this.referenceCount();
    if(count===null?this.jobs.filter(job=>job.status!=='cancelled').length>=this.maxImages:count>this.maxImages)return Promise.reject(Error(t("이미지는 최대 {count}장까지 첨부할 수 있습니다.",{count:this.maxImages})));
    return new Promise((resolve,reject)=>{
      const job={id,source,file,name:file.name||t("붙여넣은 이미지"),status:'queued',controller:new AbortController(),resolve,reject,...(optimized?{result:{blob:file,width,height,originalSize}}:{})};
      this.jobs.push(job);this.schedule(job);
    });
  }
  schedule(job){
    job.status='queued';this.onChange(this.jobs);
    this.queue=this.queue.catch(()=>{}).then(async()=>{
      if(job.status==='cancelled')return;
      try{
        job.status='processing';this.onChange(this.jobs);const optimized=job.result||await this.optimize(job.file);if(job.status==='cancelled')return;job.result=optimized;
        job.file=null;job.status='saving';this.onChange(this.jobs);
        const media=await this.send(job.result,job.controller.signal,job.id);if(job.status==='cancelled')return;
        job.status='done';job.url=media.url;job.size=media.size;job.resolve(media.url);job.resolve=null;job.reject=null;
      }catch(error){if(job.status!=='cancelled'){job.status='error';job.error=error.name==='TimeoutError'?t("응답이 늦습니다. 잠시 후 재시도해 주세요."):error.message||t("이미지를 처리하지 못했습니다.");}}
      this.onChange(this.jobs);
    });
  }
  retry(id){const job=this.jobs.find(job=>job.id===id);if(job?.status==='error')this.schedule(job);}
  discardRemoved(){for(const job of this.jobs)if(!['done','cancelled'].includes(job.status)&&!this.isReferenced(job))this.cancel(job.id);}
  cancel(id){
    const job=this.jobs.find(job=>job.id===id);if(!job||job.status==='cancelled')return;
    job.status='cancelled';job.controller.abort();job.reject?.(new DOMException(t("이미지 처리를 취소했습니다."),'AbortError'));job.file=null;job.result=null;job.resolve=null;job.reject=null;this.onChange(this.jobs);
  }
  snapshots(){return this.jobs.filter(job=>job.status!=='cancelled').map(job=>({id:job.id,source:job.source,url:job.url,name:job.name,status:job.status,error:job.error,
    blob:job.result?.blob||job.file,optimized:!!job.result,width:job.result?.width,height:job.result?.height,originalSize:job.result?.originalSize}));}
  destroy(){for(const job of this.jobs)if(job.status!=='done')this.cancel(job.id);}
}
