import {t} from './i18n.js';

// Early UI guidance only; the server rechecks the current state on every write.
export function contentWriteRestriction(thread,user,target=thread){
  if((thread.protected||target.protected)&&user?.role!=='admin')return t("보호된 글입니다. 운영자만 본문·댓글을 수정하거나 댓글을 작성할 수 있습니다.");
  if(thread.locked&&user?.role!=='admin')return t("잠긴 글입니다. 본문·댓글 수정과 새 댓글 작성을 할 수 없습니다.");
  return null;
}
