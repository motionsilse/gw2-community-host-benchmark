import {t} from './i18n.js';

const invalid=()=>{throw Error(t('이미지 파일의 형식이나 크기 정보를 확인할 수 없습니다.'));};
const checked=(width,height)=>{
  if(!width||!height)invalid();
  if(width*height>24000000)throw Error(t('이미지는 2,400만 화소 이하로 선택해 주세요.'));
  return {width,height};
};

// Never ask the browser to decode an unbounded canvas. Only inspect a bounded
// header prefix; unusual files with more than 1 MiB of leading metadata fail closed.
export async function inspectImageHeader(file){
  const bytes=new Uint8Array(await file.slice(0,Math.min(file.size,1024**2)).arrayBuffer()),view=new DataView(bytes.buffer);
  const has=(offset,size)=>offset>=0&&offset+size<=bytes.length;
  const text=(offset,value)=>has(offset,value.length)&&[...value].every((c,i)=>bytes[offset+i]===c.charCodeAt(0));
  const u24=offset=>bytes[offset]+bytes[offset+1]*256+bytes[offset+2]*65536;
  if(file.type==='image/png'){
    if(!has(0,33)||![137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b)||view.getUint32(8)!==13||!text(12,'IHDR'))invalid();
    return checked(view.getUint32(16),view.getUint32(20));
  }
  if(file.type==='image/jpeg'){
    if(!has(0,2)||bytes[0]!==255||bytes[1]!==216)invalid();
    let offset=2,dimensions=null;
    while(has(offset,4)){
      if(bytes[offset++]!==255)invalid();
      while(has(offset,1)&&bytes[offset]===255)offset++;
      if(!has(offset,3))invalid();
      const marker=bytes[offset++],size=view.getUint16(offset);
      if(marker===0||marker===0xd9||size<2||!has(offset,size))invalid();
      if(marker===0xda){if(!dimensions||size<6||size!==6+2*bytes[offset+2])invalid();return dimensions;}
      if([0xc0,0xc1,0xc2].includes(marker)){
        if(dimensions||size<8||size!==8+3*bytes[offset+7])invalid();
        dimensions=checked(view.getUint16(offset+5),view.getUint16(offset+3));
      }
      offset+=size;
    }
    invalid();
  }
  if(file.type==='image/webp'){
    if(!has(0,12)||!text(0,'RIFF')||!text(8,'WEBP')||view.getUint32(4,true)+8!==file.size)invalid();
    let canvas=null,offset=12;
    for(let chunks=0;chunks<128&&has(offset,8);chunks++){
      const size=view.getUint32(offset+4,true),start=offset+8,end=start+size;
      if(end+(size%2)>file.size)invalid();
      let dimensions;
      if(text(offset,'VP8X')){
        if(canvas||offset!==12||size!==10||!has(start,10)||(bytes[start]&2))invalid();
        canvas=checked(u24(start+4)+1,u24(start+7)+1);
      }else if(text(offset,'VP8 ')){
        if(size<10||!has(start,10)||(bytes[start]&1)||bytes[start+3]!==157||bytes[start+4]!==1||bytes[start+5]!==42)invalid();
        dimensions=checked(view.getUint16(start+6,true)&16383,view.getUint16(start+8,true)&16383);
      }else if(text(offset,'VP8L')){
        if(size<5||!has(start,5)||bytes[start]!==47)invalid();
        const bits=view.getUint32(start+1,true);if(bits>>>29)invalid();
        dimensions=checked((bits&16383)+1,((bits>>>14)&16383)+1);
      }
      if(dimensions){if(canvas&&(canvas.width!==dimensions.width||canvas.height!==dimensions.height))invalid();return dimensions;}
      offset=end+(size%2);
    }
  }
  invalid();
}
