// Keep replies with their parent even when unrelated comments arrived between
// them. Missing parents and malformed cycles must never hide a comment.
export function commentOrder(posts){
  const rows=[...posts].sort((a,b)=>a.id-b.id),byId=new Map(rows.map(post=>[post.id,post])),children=new Map(),seen=new Set(),ordered=[];
  for(const post of rows){
    if(!children.has(post.reply_to))children.set(post.reply_to,[]);
    children.get(post.reply_to).push(post);
  }
  function visit(root){
    const pending=[{post:root,depth:0,parent:null}];
    while(pending.length){
      const item=pending.pop();if(seen.has(item.post.id))continue;
      seen.add(item.post.id);ordered.push(item);
      for(const child of [...(children.get(item.post.id)||[])].reverse())pending.push({post:child,depth:item.depth+1,parent:item.post});
    }
  }
  for(const post of rows)if(!byId.has(post.reply_to))visit(post);
  for(const post of rows)if(!seen.has(post.id))visit(post);
  return ordered;
}
