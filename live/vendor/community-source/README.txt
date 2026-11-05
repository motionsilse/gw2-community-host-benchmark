GW2 community browser source

The readable browser modules are under public/community/.
Shared document validation: src/community-content.js
Authentication helpers: public/member-credential.js and public/guest-credential.js
Markdown renderer: public/md.js
Build: scripts/build-community.mjs
Exact dependency versions: package.json and package-lock.json
Install with npm ci, then npm run build:community.
Base license: ../BASE-LICENSE (GPL v2).
TinyMCE readable sources and notices: ../tinymce/. DOMPurify: ../DOMPurify.js and ../DOMPurify-LICENSE. PhotoSwipe: ../PhotoSwipe.js and ../PhotoSwipe-LICENSE (MIT). Font: ../fonts/noto/LICENSE.
No server credentials, environment files or private user data are distributed here.
