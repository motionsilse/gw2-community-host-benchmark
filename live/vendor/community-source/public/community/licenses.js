// One content source for the in-app view and the old standalone URLs.
export function licenseContent(locale='ko'){
  const en=locale==='en';
  return `<section class="information-page"><div class="breadcrumb"><a href="#list">${en?'Community':'커뮤니티'}</a></div>
  <h1>${en?'Open-source licenses':'오픈소스 고지'}</h1><div class="prose">
  <p>${en?'This community uses the open-source software listed below. You can read each license and its source files through the links.':'이 게시판에 사용된 오픈소스 소프트웨어입니다. 아래 링크에서 각 라이선스와 소스 코드를 확인할 수 있습니다.'}</p>
  <h2>TinyMCE 8.9.3</h2><p>Copyright © Tiny Technologies. ${en?'Self-hosted under GPL v2 or later. This site does not use Tiny Cloud or paid plugins.':'GPL v2 이상 자체 호스팅 모드로 사용합니다. Tiny Cloud와 유료 플러그인은 사용하지 않습니다.'}</p>
  <ul><li><a href="/vendor/tinymce/license.md">${en?'License':'라이선스'}</a> · <a href="/vendor/tinymce/notices.txt">${en?'Notices':'고지'}</a></li>
  <li><a href="/vendor/tinymce/tinymce.js">${en?'Readable editor source':'편집기 소스 코드'}</a> · <a href="https://github.com/tinymce/tinymce">TinyMCE ${en?'repository':'개발 저장소'}</a></li></ul>
  <h2>DOMPurify 3.4.16</h2><p>Copyright © Cure53 and contributors. <a href="/vendor/DOMPurify-LICENSE">Apache 2.0 / MPL 2.0 ${en?'license':'라이선스'}</a></p>
  <h2>PhotoSwipe 5.4.4</h2><p>Copyright © Dmytro Semenov. <a href="/vendor/PhotoSwipe-LICENSE">MIT ${en?'license':'라이선스'}</a> · <a href="/vendor/PhotoSwipe.js">${en?'Image viewer source':'이미지 뷰어 소스 코드'}</a></p>
  <h2>Noto Sans KR</h2><p>Copyright © The Noto Project Authors. <a href="/vendor/fonts/noto/LICENSE">SIL Open Font License 1.1</a>. ${en?'Fonts and the editor are served directly by this site.':'글꼴과 편집기는 이 사이트에서 직접 제공합니다.'}</p>
  <h2>${en?'Base software':'기반 소프트웨어'}</h2><ul>
  <li><a href="/vendor/BASE-LICENSE">${en?'Base engine license':'기존 엔진 라이선스'}</a> · <a href="/community/app.js">${en?'Community UI source':'커뮤니티 화면 소스'}</a></li>
  <li><a href="/vendor/community-source/README.txt">${en?'Source and build instructions':'소스 구성·빌드 안내'}</a> · <a href="/vendor/community-source/package-lock.json">${en?'Exact dependency versions':'정확한 의존성 버전'}</a></li></ul>
  </div><a class="button" href="#list">${en?'Back to community':'커뮤니티로'}</a></section>`;
}
export function licensesPage(ctx,locale){ctx.setPage(licenseContent(locale));}
