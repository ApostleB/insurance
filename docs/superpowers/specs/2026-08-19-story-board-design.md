# "이야기" 게시판 & 관리자 페이지 설계

## 배경

현재 사이트는 홈 / 설계신청 / 청구신청 / 개인정보처리방침 네 페이지로 구성되어 있고,
고객이 입력한 개인정보를 **저장하지 않고** Discord 웹훅으로만 전달하는 구조다.

여기에 설계사 본인을 알리는 PR·포트폴리오 성격의 게시판을 추가한다.
게시글은 설계사 본인이 직접 작성하는 **공개 콘텐츠**이므로 DB에 저장해도 개인정보 이슈가 없다.
기존의 "DB 없음" 원칙은 **고객 접수 데이터에 한정**되며, 이 원칙은 그대로 유지한다.

## 이름

- 네비 라벨: **이야기**
- URL: `/story`

## 정보 구조

### 공개 라우트

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/story` | 목록 (상단 고정 글 우선 → `sortOrder` 순) |
| GET | `/story/:id` | 상세 |
| GET | `/api/story/slides` | 홈 슬라이드용 JSON |

### 관리자 라우트 (전부 로그인 필요)

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET/POST | `/admin/login` | 로그인 |
| POST | `/admin/logout` | 로그아웃 |
| GET | `/admin/story` | 목록 (고정/홈노출/게시 토글, 순서 변경) |
| GET/POST | `/admin/story/new` | 작성 |
| GET/POST | `/admin/story/:id/edit` | 수정 |
| POST | `/admin/story/:id/delete` | 삭제 |
| POST | `/admin/upload/image` | Quill 에디터 이미지 업로드 |

### 기존 페이지와의 관계

설계신청·청구신청 폼과 그 무DB 원칙은 이 기능과 **완전히 분리**된다.
DB는 오직 "이야기" 게시판 전용이다.

## 데이터 모델

### `posts` 테이블 (DB에 저장되는 유일한 것)

```prisma
model Post {
  id           Int      @id @default(autoincrement())
  title        String   @db.VarChar(200)
  /// 대표 이미지 저장 파일명 (UUID.ext) — 파일 자체가 아니라 파일명 문자열만 저장
  mainImage    String   @db.VarChar(255)
  /// Quill 에디터가 생성한 HTML. 본문 삽입 이미지는 <img src="/uploads/story/xxx.png"> 형태로 이 안에 포함된다
  /// 본문은 선택 입력이라 빈 문자열일 수 있다 (null 대신 '' 로 저장)
  content      String   @db.Text
  /// 선택: 원문/출처 링크 (자격증 발급처, 보도 원문 등) — 상세 페이지에 "원문 보기" 버튼으로 노출
  sourceUrl    String?  @db.VarChar(500)
  /// 게시판 목록 상단 고정
  isPinned     Boolean  @default(false)
  /// 홈 슬라이드 노출 여부 (isPinned과는 별개)
  showOnHome   Boolean  @default(false)
  /// 게시/비공개
  isPublished  Boolean  @default(true)
  /// 관리자가 조정하는 노출 순서
  sortOrder    Int      @default(0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([isPinned, sortOrder])
  @@map("posts")
}
```

DB 접속 정보는 `.env`의 `DATABASE_URL`에 설정한다 (`bytebard.cloud:15432`).
`.env`는 저장소에 커밋되지 않으므로 배포 서버에 직접 배치한다.

### 정렬 규칙

공개 목록(`GET /story`)과 슬라이드 API 모두 동일한 규칙을 쓴다.

```
ORDER BY isPinned DESC, sortOrder ASC, createdAt DESC
```

- `sortOrder`는 **오름차순** — 값이 작을수록 위에 온다.
- 신규 글은 `sortOrder = 0`으로 저장되어 **목록 최상단**에 오고,
  같은 값끼리는 `createdAt DESC`로 최신 글이 먼저 온다.
  (관리자가 순서를 따로 만지지 않아도 최신 글이 위로 오는 자연스러운 기본 동작)
- 관리자가 위/아래 버튼으로 순서를 조정하면 두 글의 `sortOrder` 값을 맞바꾼다.
  이때 두 글의 값이 같으면(둘 다 0) 스왑이 무의미하므로,
  **순서 조정 시점에 해당 목록의 `sortOrder`를 1, 2, 3...으로 재부여한 뒤 스왑**한다.

### DB에 저장하지 않는 것

**관리자 계정** — 별도 `admins` 테이블을 만들지 않는다.
비밀번호 하나뿐인 구조이므로 `.env`의 `ADMIN_PASSWORD_HASH`(bcrypt 해시)로 관리한다.
계정을 여러 개 두거나 권한을 나눌 계획이 생기면 그때 테이블을 도입한다.

**이미지 파일 자체** — `public/uploads/story/` 폴더에 실제 파일로 저장하고,
DB에는 그 파일을 가리키는 문자열만 저장한다 (일반적인 웹사이트 구조와 동일).

## 이미지 처리

### 업로드 경로

- 저장 위치: `public/uploads/story/` — **공개 서빙**한다.
  (예전 청구신청 첨부파일과 달리, 방문자에게 보여줘야 하는 콘텐츠이기 때문)
- 저장 파일명은 **UUID로 재생성**하여 경로 조작(path traversal)을 차단한다.

### 검증

- 허용 MIME 화이트리스트: `image/jpeg`, `image/png`, `image/webp`
- 확장자 이중 검증 (MIME과 확장자 모두 확인)
- 크기 제한: `MAX_IMAGE_SIZE_MB` 환경변수 기반

### 대표 이미지 vs 본문 이미지

| 구분 | 등록 방법 | 저장 위치 |
| --- | --- | --- |
| 대표 이미지 | 별도 `<input type="file">`로 즉시 업로드 (에디터를 거치지 않음) | `posts.mainImage` |
| 본문 이미지 | Quill 에디터 이미지 버튼 → 같은 업로드 엔드포인트 → `<img>` 삽입 | `posts.content` HTML 내부 |

### 삭제 정책 (의도된 트레이드오프)

글 삭제 시 **대표 이미지 파일만** 함께 삭제한다.
본문에 삽입된 이미지는 파일시스템에 남는다(고아 파일).

본문 이미지까지 완벽히 추적하려면 별도 `PostImage` 테이블이 필요한데,
설계사 1인이 운영하는 규모에서는 오버엔지니어링이라고 판단했다.
디스크 용량이 실제로 문제가 되면 그때 정리 스크립트를 추가한다.

## 에디터

KABD 프로젝트(`/Users/jeongbaul/Dev/MINISH/kabd`)에서 사용 중인 **Quill**을 동일하게 사용한다.

- KABD는 Next.js/React라 `react-quill-new` 래퍼를 쓰지만,
  이 프로젝트는 EJS + 바닐라 JS이므로 **Quill 코어 라이브러리를 직접 로드**한다.
- 이미지 리사이즈가 필요하면 `quill-resize-image` 플러그인을 함께 사용한다.
- 이미지 핸들러는 KABD와 동일한 패턴: 파일 선택 → 서버 업로드 → 반환된 URL을 `insertEmbed`로 삽입.
- Quill CDN 사용 시 `helmet` CSP의 `script-src` / `style-src`에 해당 출처를 추가해야 한다.

### 본문 HTML 저장 시 XSS 방어 (필수)

`posts.content`에는 HTML이 그대로 저장되고, 상세 페이지에서 EJS `<%- %>`로
**이스케이프 없이** 출력해야 서식이 살아난다. 이는 저장형 XSS의 전형적인 경로다.

관리자만 글을 쓰므로 위험도는 낮지만, 관리자 세션이 탈취되거나
외부에서 복사한 HTML을 붙여넣는 경우를 대비해 **저장 시점에 서버에서 sanitize**한다.

- `sanitize-html` 등으로 허용 태그·속성 화이트리스트를 적용한다
- 허용: 서식 태그(`p`, `strong`, `em`, `u`, `s`, `h1~h3`, `ul`, `ol`, `li`, `a`, `img`, `br`, `blockquote`), Quill이 쓰는 `class`/`style` 일부
- 차단: `script`, `iframe`, `on*` 이벤트 핸들러 속성, `javascript:` 스킴
- 클라이언트 검증에만 의존하지 않는다 — 반드시 서버에서 처리한다

## 홈 슬라이드

### API

```
GET /api/story/slides
```

- 조건: `isPublished = true AND showOnHome = true`
- 정렬: 게시판과 동일한 `sortOrder` 기준 (별도 순서 필드를 두지 않고 재사용)
- 응답:

```json
{
  "slides": [
    { "id": 12, "title": "손해사정사 자격 취득", "imageUrl": "/uploads/story/ab12.jpg", "href": "/story/12" },
    { "id": 9,  "title": "2025 우수설계사 수상",  "imageUrl": "/uploads/story/f031.jpg", "href": "/story/9" }
  ]
}
```

### 캐러셀 동작 (`public/js/story-slider.js`)

- 홈페이지 로드 시 이 API를 fetch해서 렌더링
- 기본 5초마다 다음 글로 자동 전환
- **전환 방식**: 슬라이드를 가로로 늘어놓은 트랙을 `translate3d`로 민다.
  페이지가 아니라 트랙만 움직이므로 전환 중 문서 스크롤이 발생하지 않는다.
- **순환**: 트랙 앞뒤에 마지막/첫 슬라이드의 클론을 한 장씩 둔다.
  마지막 → 처음으로 넘어갈 때도 되감기지 않고 같은 방향으로 흐르며,
  전환이 끝나는 시점에 대응하는 진짜 슬라이드 자리로 소리 없이 되돌린다.
  클론은 `aria-hidden` + `tabindex="-1"`로 보조기술·탭 이동에서 제외한다.
- 슬라이드 클릭 시 `/story/:id` 상세로 이동 (스와이프로 끝난 제스처는 클릭을 막는다)
- **데스크톱**: 마우스 오버 → 정지 / 마우스 아웃 → 재개 (커서가 슬라이더 위에 머무는 동안은 계속 정지)
- **모바일**: 터치 시작 → 정지 / 터치 종료 후 잠깐 뒤 재개
- **수동 이동 (터치·마우스 공용)**: 좌우로 끌면 다음/이전 글로 이동한다. 끄는 동안
  트랙이 손가락/커서를 따라오고, 이동량이 50px에 못 미치면 제자리로 되돌아간다.
  터치와 마우스가 같은 판정을 쓰도록 종료 처리(`finishDrag`)를 한 곳에 모았다.
- **데스크톱 조작 수단**: 데스크톱에는 touch 이벤트가 오지 않으므로(`maxTouchPoints: 0`)
  터치 경로만으로는 조작 수단이 하나도 없다. 그래서 별도로 제공한다.
  - `mousedown`/`mousemove`/`mouseup`으로 마우스 드래그. 커서가 슬라이더를 벗어나도
    이어지도록 move/up은 `window`에 건다.
  - 이전/다음 화살표 버튼. `(hover: hover) and (pointer: fine)`인 기기에서만 만들어
    터치 기기 화면을 가리지 않는다.
  - 슬라이더 안에 포커스가 있을 때 `←`/`→` 키로 이동.
  - `<a>`·`<img>`의 `draggable`을 끈다. 끄지 않으면 잡는 순간 브라우저가 네이티브
    링크 드래그를 시작해 트랙이 커서를 따라오지 않는다.
  - 터치 직후 브라우저가 만들어내는 합성 마우스 이벤트는 700ms 동안 무시해
    한 번의 스와이프가 두 칸 넘어가지 않게 한다.
- **도트 히트 영역**: 버튼은 20x24px, 눈에 보이는 막대는 그 안의 `span`이 그린다.
  버튼 자체가 6px이던 때는 데스크톱에서 사실상 누를 수 없었다.
- **페이지 스크롤 분리**: 뷰포트에 `touch-action: pan-y`를 주고, 첫 `touchmove`에서
  가로 성분이 우세하다고 판정되면 `preventDefault`로 브라우저 기본 스크롤을 막는다.
  세로가 우세하면 아무것도 가로채지 않아 페이지 스크롤이 그대로 동작한다.
- `prefers-reduced-motion: reduce`이면 전환 애니메이션을 끈다
- `showOnHome` 글이 0개면 슬라이드 섹션 자체를 렌더링하지 않음 (빈 캐러셀 방지)

## 관리자 페이지

### 인증

- `.env`의 `ADMIN_PASSWORD_HASH`(bcrypt 해시)와 비교 — 평문 비밀번호를 저장하지 않는다
- 성공 시 `express-session`으로 세션 발급
- 세션 저장소는 **메모리(기본값)** — PM2 재배포/재시작 시 로그아웃되지만,
  관리자 1인이 가끔 쓰는 용도이므로 세션 DB까지는 두지 않는다
- `/admin/*` 전체에 로그인 확인 미들웨어 적용, 미로그인 시 `/admin/login`으로 리다이렉트
- 로그인 시도에도 rate limit을 적용한다 (기존 `formSubmitLimiter` 패턴 재사용)

### 목록 (`GET /admin/story`)

- 테이블 컬럼: 제목 / 게시상태 / 상단고정 / 홈노출 / 순서
- 각 행에서 즉시 토글: 상단고정, 홈노출, 게시·비공개
- 순서 변경: 위/아래 버튼으로 `sortOrder` 스왑
  (드래그앤드롭보다 단순하고, 게시글 수가 적을 때 충분하다)

### 작성 / 수정

- 입력: 제목, 대표 이미지(파일 첨부), 원문 링크(선택), Quill 본문(선택)
- **본문은 선택 입력** — 자격증 사진처럼 대표 이미지 한 장이면 충분한 글이 있다.
  미입력 시 빈 문자열로 저장하고(컬럼이 NOT NULL), 상세 페이지는 본문 영역을 아예 렌더링하지 않는다.
- 저장 시 **zod로 검증** — 이 프로젝트의 기존 검증 패턴을 그대로 재사용

### 삭제

- DB row 삭제 + 대표 이미지 파일 삭제 (본문 이미지는 위 정책대로 유지)

## 새로 추가되는 환경변수

| 키 | 필수 | 설명 |
| --- | :---: | --- |
| `DATABASE_URL` | ✅ | PostgreSQL 접속 문자열 |
| `ADMIN_PASSWORD_HASH` | ✅ | 관리자 비밀번호 bcrypt 해시 |
| `SESSION_SECRET` | ✅ | express-session 서명 키 |
| `MAX_IMAGE_SIZE_MB` | | 업로드 이미지 최대 크기 (기본 5) |

기존과 동일하게 `src/config/env.ts`에서 zod로 검증하고, 누락 시 명확한 에러와 함께 종료한다.

## 방문자 참여

댓글·좋아요 등 방문자 참여 기능은 **넣지 않는다**.
설계사가 쓰고 공개만 하는 PR/포트폴리오 성격에 맞고,
스팸 대응·모니터링 부담이 없다.

## 영향받는 기존 파일

| 파일 | 변경 내용 |
| --- | --- |
| `src/app.ts` | 세션 미들웨어 추가, Quill CDN에 대한 CSP 출처 추가 |
| `src/routes/index.ts` | `/story`, `/api/story/slides`, `/admin/*` 라우트 등록 |
| `src/config/env.ts` | 위 신규 환경변수 4종 검증 추가 |
| `src/views/partials/header.ejs` | 네비에 "이야기" 링크 추가 |
| `src/views/index.ejs` | 홈 슬라이드 섹션 추가 |
| `src/controllers/seo.controller.ts` | sitemap에 `/story` 추가, robots.txt에 `Disallow: /admin` 추가 |
| `package.json` | prisma, @prisma/client, express-session, bcrypt, multer, sanitize-html 추가 |
| `.gitignore` | 기존 `uploads/` 규칙은 프로젝트 루트 기준이므로 `public/uploads/` 규칙을 별도로 추가 |

## 테스트 범위

기존 `npm test`(e2e, 스텁 웹훅 기반)에 다음을 추가한다.

- 미로그인 상태에서 `/admin/*` 접근 → 로그인 페이지로 리다이렉트
- 잘못된 비밀번호 → 로그인 실패
- 게시글 CRUD 정상 동작
- 비공개(`isPublished = false`) 글이 공개 목록·슬라이드 API에 나오지 않는지
- `showOnHome = false` 글이 슬라이드 API에 나오지 않는지
- 허용되지 않는 MIME 타입 업로드 차단
- `<script>` 태그가 포함된 본문 저장 시 sanitize되어 제거되는지
- 정렬 규칙: 고정 글이 항상 위에 오고, 같은 조건이면 최신 글이 먼저 오는지
