// Password material lives only in the active request. Never persist it in browser storage.
globalThis.MemberCredential=(()=>{
  const sensitive=new Set(['/account/password','/account/username','/account/delete','/account/duress','/2fa/enable','/2fa/disable']);
  const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  async function derive(password,salt){
    if(typeof password!=='string'||password.length>1024||!/^[a-f0-9]{32}$/.test(salt))throw Error('비밀번호 인증 정보를 확인해 주세요.');
    const encoder=new TextEncoder(),key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
    const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:600000,salt:encoder.encode(`gw2-member-v1:${salt}`)},key,256);
    return {scheme:'member-v1',salt,proof:hex(bits)};
  }
  async function fresh(password,min=8){
    if(typeof password!=='string'||password.length<min||password.length>128)throw Error(`비밀번호는 ${min}~128자로 입력해 주세요.`);
    return derive(password,hex(crypto.getRandomValues(new Uint8Array(16))));
  }
  async function parameters(username){
    const r=await fetch('/api/member/parameters',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username})});
    const data=await r.json();if(!r.ok)throw Error(data.error||'인증 정보를 불러오지 못했습니다.');
    if(data.scheme!=='member-v1'||data.iterations!==600000||!Array.isArray(data.salts)||data.salts.length!==2||data.salts.some(s=>!/^[a-f0-9]{32}$/.test(s))||typeof data.legacy!=='boolean')throw Error('인증 정보가 올바르지 않습니다. 화면을 새로고침해 주세요.');
    return data;
  }
  async function loginProof(password,params){
    const credentials=[];for(const salt of params.salts)credentials.push(await derive(password,salt));
    return {scheme:'member-login-v1',credentials,...(params.legacy?{legacy:password}:{})};
  }
  async function prepare(path,options,user){
    if(options.method!=='POST'||!['/register','/setup','/login','/admin/set-password','/member/reset',...sensitive].includes(path))return options;
    const body=JSON.parse(options.body);
    if(path==='/register'||path==='/setup')body.password=await fresh(body.password);
    else if(path==='/admin/set-password'||path==='/member/reset')body.newPassword=await fresh(body.newPassword);
    else{
      const params=await parameters(path==='/login'?body.username:user?.username);
      body.password=await loginProof(body.password,params);
      if(path==='/account/password')body.newPassword=await fresh(body.newPassword);
      if(path==='/account/duress'&&body.duress){
        const original=body.duress;body.duress=await fresh(original);body.duress.comparison=await loginProof(original,params);
      }
    }
    return {...options,body:JSON.stringify(body)};
  }
  return {derive,prepare};
})();
