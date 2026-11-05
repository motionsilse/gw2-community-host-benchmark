export async function deriveProof(password,key,salt){
  if(typeof password!=='string'||password.length<8||password.length>128)throw Error('비밀번호를 8~128자로 입력해 주세요.');
  if(!/^[0-9a-f-]{36}$/.test(key)||!/^[0-9a-f]{32}$/.test(salt))throw Error('잘못된 글 인증 정보입니다.');
  const text=new TextEncoder();
  const material=await crypto.subtle.importKey('raw',text.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:600000,salt:text.encode(`gw2-guest-v1:${key}:${salt}`)},material,256);
  return [...new Uint8Array(bits)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
