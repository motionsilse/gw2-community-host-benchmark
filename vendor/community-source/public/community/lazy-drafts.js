// Reading the board does not need IndexedDB or attachment draft validation.
export function lazyDraftStore(load=()=>import('./drafts.js')){
  let pending;
  const store=()=>pending??=(load().then(module=>module.openDraftStore()).catch(error=>{pending=undefined;throw error;}));
  return Object.fromEntries(['get','list','save','remove'].map(method=>[method,async(...args)=>(await store())[method](...args)]));
}
