# CINELIQ 코드 수정 안내

## 시작할 파일

처음에는 `index.html`을 열어 헤더, 전체 메뉴, 첫 화면, 기법 라이브러리, 마이페이지, 상세 모달의 순서부터 확인하세요. 각 영역은 id 또는 class로 연결됩니다. HTML의 id/class/data-* 이름을 바꾸면 JavaScript와 CSS도 함께 확인해야 합니다.

사이트는 HTML·CSS·JavaScript 파일을 직접 읽는 구조입니다. React, 별도 빌드, 새 프레임워크를 추가하지 않았습니다. 파일을 수정한 뒤 로컬 HTTP 서버에서 확인하세요. Python이 설치되어 있다면 이 폴더에서 `python -m http.server 8000`을 실행하고 `http://localhost:8000/`으로 접속할 수 있습니다. 파일을 더블클릭한 file:// 주소에서는 인증과 일부 브라우저 기능을 제대로 검사할 수 없습니다.

## 무엇을 바꾸려는지에 따른 파일

| 수정하려는 내용 | 먼저 볼 파일 |
| --- | --- |
| 헤더·메뉴·첫 화면·마이페이지의 기본 HTML | index.html |
| 기본 레이아웃·카드·화면 너비별 배치 | styles.css |
| 다크·라이트 색상 값 | theme.css의 --ui-* 변수 |
| 테마 저장·시스템 테마 반영 | theme.js |
| 접근성 화면·글자 크기·모션 감소 | accessibility.css, accessibility.js |
| 카테고리·검색·필터·카드·상세 모달 | app.js |
| 기본 기법 이름·설명·태그·이미지/영상 분류 | data.js |
| 별도로 검토된 표시 명칭 | technique-names.js |
| 기존 학습 설명·프롬프트 | learning-data.js |
| 확장 이미지·영상 학습 데이터 | full-learning-data.js |
| 학습 설명의 화면 구성 | learning-ui.js, full-learning-ui.js, learning.css |
| 실무 용어와 제작·편집 가이드 | terminology-data.js, production-data.js, production-ui.js, glossary.js |
| 영상 모델 선택과 준비 상태 | video-models.js |
| 이미지·영상 기법 분류 기준 | content-types.js |
| 여러 이미지의 겹침·전환·스와이프 | image-carousel.js, image-carousel.css |
| 정렬 선택 메뉴·회색 강조 | sort-menu.js, sort-menu.css |
| 로그인·회원 헤더·북마크 UI | member.js |
| 개인 폴더·마이페이지 각 화면 | member-library.js, member-library.css |
| 폴더 선택 저장창·전체 선택 | folder-save.js, bulk-selection.js, usability.css |
| 공개 미디어 업로드·관리자 화면 | media-admin.js |
| Supabase Auth·Storage·회원 데이터 요청 | media-cloud.js |
| 공개 Supabase 프로젝트 연결 값 | media-config.js |
| 회원 탈퇴·계정 충돌 안내 UI | member-deletion.js, member-merge.js |
| 서버의 탈퇴·격리된 계정 통합 시험 | supabase/functions/ |
| 테이블·RLS·RPC 정의 | supabase/*.sql |
| 서비스 안내·약관·문의 | service-info.js, contact.html, terms.html, privacy.html |

CSS는 index.html에서 읽는 순서도 중요합니다. styles.css에 과거 디자인을 보완하는 규칙이 남아 있고 theme.css·접근성 CSS 등이 뒤에서 적용됩니다. 같은 선택자를 발견했다고 바로 지우지 마세요. 이 검토본은 뒤에서 완전히 같은 값으로 덮어쓰는 앞쪽 선언12개가 정리된 상태입니다.

## app.js 읽는 순서

1. APP_SETTINGS는 한 번에 표시하는 카드 수와 기존 로컬 미디어 저장소 이름입니다. 저장소 이름을 바꾸면 기존 미디어를 찾지 못할 수 있습니다.
2. techniques는 기법 목록, techniquesById는 ID로 기법을 찾는 표, libraryState는 현재 검색·필터·정렬·열린 모달 상태입니다.
3. matchesTechniqueSearch는 검색어 일치 여부를 확인합니다.
4. matchesLibraryFilters는 카테고리·태그·등록 상태·콘텐츠 유형을 확인합니다. 관리자만 보는 등록 상태 조건을 유지해야 합니다.
5. getFilteredTechniques는 결과를 모아 정렬합니다.
6. renderTechniqueCard와 renderTechniqueMedia가 카드와 미디어 HTML을 만듭니다.
7. selectMainCategory, selectSubcategory, toggleSceneTag, selectContentType은 사용자 선택을 상태에 반영합니다.
8. handleLibraryClick과 handleLibraryShortcuts가 클릭·키보드 입력을 구분합니다.
9. setupLibraryEvents는 이벤트를 연결하고, renderLibrary는 화면을 갱신합니다.

findElement는 화면 요소를 찾고 escapeHtml은 텍스트를 HTML에 안전하게 넣습니다. escapeHtml을 생략하거나 사용자 입력을 그대로 innerHTML에 넣지 마세요.

## 캐러셀 읽는 순서

createCarouselMarkup이 이미지와 버튼 HTML을 만들고 setupCarousel이 동작을 연결합니다. currentImageIndex가 현재 이미지 번호이며 showAdjacentImage가 이전·다음 이미지, 번호, 뒤쪽 미리보기와 애니메이션을 갱신합니다. 가로/세로 이동량을 분리하여 세로 스크롤을 이미지 이동으로 처리하지 않습니다.

## 데이터와 보안 주의사항

- CAM-* ID, Supabase 테이블 이름, data-* 속성, 공개 window.CINELIQ_* API는 기존 연결을 유지합니다.
- Supabase publishable key는 공개 연결 값입니다. service_role 키·Client Secret·비밀번호는 이 저장소에 넣지 마세요.
- 버튼이 숨겨졌다고 권한 검증이 끝나는 것은 아닙니다. Auth 사용자 UUID 확인·RLS·서버 검증을 함께 유지해야 합니다.
- 운영 SQL 실행, 회원 삭제·로그인 수단 해제·계정 강제 병합은 코드 읽기와 다른 작업입니다. 이 리팩터링에서는 실행하지 않았습니다.
- 기본 원본 기법, 학습 문구, 미디어 파일은 보존했습니다. 생성 스크립트를 실행하면 생성 파일을 덮어쓸 수 있으므로 실행 전에 변경 내용을 확인하세요.
- google896cae5064a99afa.html은 위치와 내용을 유지하세요.

## 테스트 실행

한 번 준비할 개발용 도구는 배포 코드와 분리된 work 폴더에 둡니다. 기존 준비가 되어 있으면 다시 설치할 필요가 없습니다.

```powershell
npm install --prefix work/refactor-tools --no-audit --no-fund prettier @babel/parser @babel/generator @babel/traverse postcss parse5
npm install --prefix work/sql-tools --no-audit --no-fund @electric-sql/pglite
npm install --prefix work/a11y-tools --no-audit --no-fund axe-core
node --test tests/*.cjs supabase/tests/*.mjs
node tests/browser/usability.cjs
node tests/browser/menu.cjs
node tests/browser/sort-menu.cjs
node tests/browser/image-carousel.cjs

```

브라우저 검사는 Windows의 Edge 경로를 사용하며 실제 회원 대신 모의 회원 데이터를 씁니다. 실제 iOS·Android, 실제 OAuth 동의·계정 통합이 통과했다는 의미는 아닙니다.

## 저장과 되돌리기

이 저장소는 검토용 main 브랜치를 사용합니다. 로컬 수정은 새 브랜치에서 검토하고 커밋하세요. GitHub Pages를 활성화하지 않으며 운영 저장소·Supabase 설정을 바꾸지 않습니다.


## 검토할 화면: 자주 수정하는 화면의 위치

행 번호는 이 문서 작성 시점 기준입니다. 코드가 바뀌면 Ctrl+F로 함수명·선택자를 찾으세요.

| 수정 대상 | 파일과 시작 행 | 찾을 함수·선택자 | 수정할 때 볼 내용 |
| --- | --- | --- | --- |
| 전체 배경·색상 | [theme.css:1](theme.css#L1) | `:root[data-theme` | --ui-bg/--ui-panel/--ui-text 값을 찾으세요. |
| 기법 카드 틀 | [app.js:459](app.js#L459) | `renderTechniqueCard` | 카드 제목·영문명·설명·하단 동작 HTML을 만듭니다. |
| 기법 카드 배치 | [styles.css:614](styles.css#L614) | `.card-grid {` | 열 수·카드 간격을 확인하고 같은 선택자의 반응형 규칙도 찾으세요. |
| 카드/상세 미디어 | [app.js:390](app.js#L390) | `renderTechniqueMedia` | 한 장·다중 이미지·영상 표시를 나눕니다. |
| 상세 모달 구성 | [app.js:697](app.js#L697) | `openDetail` | 제목·미디어·설명·프롬프트·관리자 영역을 구성합니다. |
| 상세 모달 레이아웃 | [styles.css:795](styles.css#L795) | `.detail-panel {` | 모달 폭·높이·스크롤·모바일 규칙을 확인하세요. |
| 이미지 캐러셀 HTML | [image-carousel.js:4](image-carousel.js#L4) | `createCarouselMarkup` | 겹친 이미지와 컨트롤의 HTML을 만듭니다. |
| 이미지 캐러셀 동작 | [image-carousel.js:35](image-carousel.js#L35) | `setupCarousel` | 이미지 번호·스와이프·키보드·모션 감소 처리입니다. |
| 이미지 겹침 간격 | [image-carousel.css:1](image-carousel.css#L1) | `.image-stack {` | --stack-offset과 프레임·컨트롤 스타일을 확인하세요. |
| 햄버거 메뉴 동작 | [app.js:853](app.js#L853) | `setupNavigation` | 열기·닫기·배경 스크롤 잠금·포커스·스와이프를 처리합니다. |
| 메뉴 카테고리 목록 | [app.js:207](app.js#L207) | `renderNav` | 전체 기법과 카테고리/세부 분야 버튼을 만듭니다. |
| 검색어 일치 | [app.js:307](app.js#L307) | `matchesTechniqueSearch` | 기법 이름·설명·용어 검색을 판단합니다. |
| 이미지/영상·카테고리 필터 | [app.js:322](app.js#L322) | `matchesLibraryFilters` | 콘텐츠 유형과 태그·관리자 등록 필터를 판단합니다. |
| 검색·정렬 결과 | [app.js:343](app.js#L343) | `getFilteredTechniques` | 찾은 기법을 현재 선택한 순서로 정렬합니다. |
| 정렬 메뉴 디자인 | [sort-menu.css:1](sort-menu.css#L1) | `:root {` | --sort-option-active 강조색을 수정합니다. |
| 정렬 키보드 조작 | [sort-menu.js:92](sort-menu.js#L92) | `handleSortMenuKeydown` | 키별 동작과 getNextOptionIndex를 확인하세요. |
| 마이페이지 기본 회원 정보 | [member-library.js:159](member-library.js#L159) | `renderMemberProfile` | 이름·로그인 수단·이메일 안내를 표시합니다. |
| 폴더·이름 편집창 초기값 | [member-library.js:363](member-library.js#L363) | `getEditorInitialName` | 새 폴더/폴더 수정/회원 이름의 초기값을 구분합니다. |
| 회원 저장 오류 안내 | [member-library.js:371](member-library.js#L371) | `getLibraryErrorMessage` | 오류 코드별 안내 문구를 선택합니다. |
| 즐겨찾기 버튼 모양 | [member.js:314](member.js#L314) | `renderBookmarkButton` | 버튼 HTML과 저장 상태 속성을 확인하세요. 저장 검증은 유지하세요. |
| 화면 모드 적용 | [theme.js:29](theme.js#L29) | `applyTheme` | 선택 모드와 실제 화면의 밝기 적용을 구분합니다. |
| 접근성 적용 | [accessibility.js:74](accessibility.js#L74) | `applyAccessibilityPreferences` | 글자·대비·링크·모션·자막과 UI 동기화를 적용합니다. |
| 폴더 저장창 | [folder-save.js:61](folder-save.js#L61) | `openSaveDialog` | 저장할 폴더를 읽고 체크 상태를 표시합니다. 세션 검사 순서는 유지하세요. |

메뉴 항목·첫 화면 문구·검색창·회원 화면의 고정 HTML은 index.html에서 `techniqueNav`, `hero`, `searchInput`, `memberPage`, `detailModal`을 검색하세요. JavaScript가 만드는 카드와 상세 HTML은 index.html에 모두 들어 있지 않으므로 위의 렌더링 함수를 함께 확인하세요.

## 회원·설정 상태 이름 읽기

- `currentUser`/`currentSession`: 지금 화면의 회원·인증 세션입니다. 이름을 바꿨을 뿐 회원 UUID나 Supabase 동작을 바꾸지 않았습니다.
- `sessionVersion`/`requestVersion`: 요청 도중 다른 계정으로 바뀌었는지 확인합니다. 오래된 요청이 새 회원 화면에 반영되지 않도록 하는 검사이므로 삭제하지 마세요.
- `isSaving`: 저장 중 버튼을 잠그고 중복 클릭을 막는 상태입니다.
- `selectedTheme`와 실제 화면 모드는 다릅니다. 선택이 system이면 시스템 밝기를 따라갑니다.
- `savedTechniques`는 북마크, `personalFolders`는 폴더, `folderEntries`는 폴더와 기법의 연결 정보입니다. 서로 같은 데이터로 합치지 마세요.
- `activeSaveRequest`는 폴더 선택창의 저장 작업, `currentOperation`은 마이페이지 편집 작업입니다. 사용자·요청 버전 검사를 그대로 유지합니다.

외부 모듈이 호출하는 `window.CINELIQ_*` 이름과 `sync`, `change`, `favoriteButton`, `open` 등의 공개 키는 유지했습니다. 내부 함수명이 길고 명확해져도 공개 API를 같이 바꾸면 다른 파일의 호출이 깨질 수 있습니다.

## CSS를 정리할 때

이번에는 styles.css의 앞쪽 중복 선언12개만 제거했습니다. 동일한 선택자·속성·값·important가 같은 조건의 뒤쪽 규칙에 그대로 있어 결과를 바꾸지 않는 경우만 정리했습니다. 선언 값이 다르거나 media 조건·선택자·우선순위가 다르면 중복이라고 단정하지 마세요. 검토본에는 정리된 스타일이 그대로 포함됩니다. 기존 커밋을 비교해야 하는 과거 검사는 이 독립 저장소에 포함하지 않았습니다.

## 추가 기능 검사

```powershell
node --test tests/*.cjs supabase/tests/*.mjs
node tests/browser/member-editor.cjs

node tests/browser/accessibility.cjs
```

회원 인증과 폴더 기능은 모의 회원 API 및 로컬 SQL 테스트로 검사합니다. 실제 OAuth나 운영 데이터 쓰기 테스트와 구분합니다.
