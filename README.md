# CINELIQ 검토용 소스

CINELIQ website source code for review and improvement.

저장소: https://github.com/guswn861415911-collab/cineliq-review

카메라 구도·컷·무빙·조명 등414개 기법을 이미지·영상·설명·AI 프롬프트로 학습하는 정적 웹사이트입니다. 검색, 이미지/영상 필터, 상세 모달, 이미지 캐러셀, 로그인, 북마크, 개인 폴더, 테마 및 접근성 기능을 포함합니다.

이 저장소는 지정 소스 커밋 b521975의 파일 스냅샷에서 만들었으며 이전 Git 기록은 포함하지 않습니다. 기존 운영 사이트와 별개인 Private 코드 검토 저장소이며 GitHub Pages는 활성화하지 않습니다.

## 코드 읽기

[CODE_GUIDE.md](CODE_GUIDE.md)에서 화면별 파일·함수 위치를 확인하세요. 홈페이지는 index.html, 검색·필터·카드는 app.js, 회원 기능은 member.js와 member-library.js, 설정은 theme.js와 accessibility.js, 캐러셀은 image-carousel.js입니다. HTML/CSS/JavaScript를 직접 사용하며 빌드나 새 프레임워크가 필요하지 않습니다.

## 로컬 미리보기

Python이 설치되어 있다면 이 폴더에서 아래 명령을 실행하고 http://localhost:8000/ 에 접속하세요. file:// 주소에서는 인증과 일부 브라우저 기능이 제한됩니다.

```sh
python -m http.server 8000
```

## 테스트

Node.js24와 Windows Edge를 기준으로 검사합니다. 테스트용 패키지는 .gitignore로 제외된 work 폴더에만 설치합니다.

```powershell
npm install --prefix work/refactor-tools --no-audit --no-fund @babel/parser postcss parse5
npm install --prefix work/sql-tools --no-audit --no-fund @electric-sql/pglite
npm install --prefix work/a11y-tools --no-audit --no-fund axe-core
node --test tests/*.cjs supabase/tests/*.mjs
node tests/browser/usability.cjs
node tests/browser/menu.cjs
node tests/browser/sort-menu.cjs
node tests/browser/image-carousel.cjs
node tests/browser/member-editor.cjs
node tests/browser/accessibility.cjs
```

과거 커밋의 파일을 git show로 읽어야 하는 비교 검사와 내부 작업 기록은 제외했습니다. 일반 기능·인증 모의·서버·로컬 SQL/RLS 검사와 브라우저 회귀 검사는 보존합니다. 실제 모바일·외부 OAuth·스크린 리더 수동 검사는 별도입니다.

## 서비스 연결과 데이터 보호

media-config.js의 Supabase Project URL과 publishable key는 기존 공개 클라이언트 값 그대로입니다. service_role 키, OAuth Client Secret, 비밀번호는 포함하지 않습니다. 공개 자료 조회는 기존 서비스로 연결될 수 있으므로 실제 회원·관리자 계정으로 저장·삭제·통합을 시험하지 마세요. 개발용 인증과 저장 테스트는 격리된 프로젝트에서 별도로 구성해야 합니다.

공개 미디어는 Supabase Storage·데이터베이스에서 제공되며 이 저장소는 운영 회원 데이터의 복사본이 아닙니다. assets에는 해당 소스 커밋이 추적하던 이미지·영상이 그대로 포함됩니다. 브라우저 로컬 저장 데이터는 기기·브라우저마다 별개입니다.

supabase 폴더는 서버·스키마 검토용입니다. 운영 프로젝트에 SQL이나 Edge Function을 배포하지 마세요. GitHub Pages·CNAME·DNS·OAuth 설정은 이 검토 저장소에서 변경하지 않습니다.
