// Shared by the editor, its HTML adapter and the server renderer.
export const FONT_SIZES=Object.freeze([12,14,16,18,20,24,28,32,36,48]);
export function fontSizeFromCSS(value){
  const match=/^(\d+)px$/i.exec(String(value||'').trim());
  const size=match?Number(match[1]):null;
  return FONT_SIZES.includes(size)?size:null;
}
