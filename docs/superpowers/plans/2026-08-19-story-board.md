# "이야기" 게시판 & 관리자 페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설계사 PR/포트폴리오용 "이야기" 게시판과 관리자 CMS를 추가하고, 홈에 자동 순환 슬라이드를 붙인다.

**Architecture:** 기존 Express + EJS + zod 구조를 그대로 따른다. 게시글은 PostgreSQL(Prisma)에 저장하되, 고객 접수 데이터의 "DB 없음" 원칙은 건드리지 않는다. 관리자는 단일 비밀번호 + 세션으로 보호하고, 이미지는 `public/uploads/story/`에 공개 서빙한다.

**Tech Stack:** TypeScript, Express 4, EJS, Prisma + PostgreSQL, zod, express-session, bcrypt, multer, sanitize-html, Quill(CDN)

## Global Constraints

- 스펙 원문: `docs/superpowers/specs/2026-08-19-story-board-design.md`
- 기존 고객 접수(설계신청/청구신청)는 **DB에 저장하지 않는다** — 이 원칙을 깨는 변경 금지
- 모든 요청 본문 검증은 **zod**로 한다 (기존 `src/schemas/` 패턴 재사용)
- 업로드 파일명은 **UUID로 재생성**한다 (경로 조작 차단)
- 허용 이미지 MIME: `image/jpeg`, `image/png`, `image/webp` — MIME과 확장자를 **모두** 검증
- 본문 HTML은 **저장 시점에 서버에서 sanitize**한다 (클라이언트 검증에만 의존 금지)
- 공개 목록/슬라이드 정렬: `isPinned DESC, sortOrder ASC, createdAt DESC`
- 코드 주석과 사용자 노출 문구는 **한국어**로 작성한다
- 각 태스크 종료 시 `npm run typecheck`가 통과해야 한다
- DB는 원격(`bytebard.cloud:15432`)이며 `.env`의 `DATABASE_URL`에 이미 설정되어 있다

---

## File Structure

**신규 생성**

| 파일 | 책임 |
| --- | --- |
| `prisma/schema.prisma` | Post 모델 정의 |
| `src/lib/prisma.ts` | PrismaClient 싱글턴 |
| `src/schemas/post.schema.ts` | 게시글 zod 스키마 |
| `src/services/post.service.ts` | 게시글 CRUD·정렬·순서 스왑 |
| `src/services/sanitize.service.ts` | 본문 HTML sanitize |
| `src/middlewares/adminAuth.ts` | 관리자 세션 확인 |
| `src/middlewares/upload.ts` | multer 이미지 업로드 설정 |
| `src/controllers/story.controller.ts` | 공개 목록/상세/슬라이드 API |
| `src/controllers/admin.controller.ts` | 로그인/로그아웃 |
| `src/controllers/adminStory.controller.ts` | 관리자 게시글 CRUD |
| `src/routes/admin.routes.ts` | `/admin/*` 라우터 |
| `src/views/story/list.ejs` | 공개 목록 |
| `src/views/story/detail.ejs` | 공개 상세 |
| `src/views/admin/login.ejs` | 로그인 |
| `src/views/admin/list.ejs` | 관리자 목록 |
| `src/views/admin/form.ejs` | 작성/수정 폼 |
| `public/js/story-slider.js` | 홈 캐러셀 |
| `public/js/admin-editor.js` | Quill 초기화 + 이미지 업로드 |
| `scripts/e2e-story.ts` | 게시판 e2e 검증 |

**수정**

| 파일 | 변경 |
| --- | --- |
| `src/config/env.ts` | 신규 환경변수 4종 검증 |
| `src/app.ts` | 세션 미들웨어, CSP에 Quill CDN 추가 |
| `src/routes/index.ts` | story·admin 라우트 등록 |
| `src/controllers/seo.controller.ts` | sitemap `/story`, robots `Disallow: /admin` |
| `src/views/partials/header.ejs` | 네비 "이야기" 추가 |
| `src/views/index.ejs` | 슬라이드 섹션 추가 |
| `src/views/partials/head.ejs` | Quill CDN 로드 (관리자 페이지 전용 분기) |
| `package.json` | 의존성 + `test:story` 스크립트 |
| `.gitignore` | `public/uploads/` 추가 |

---

### Task 1: 의존성 설치 및 Prisma 스키마

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/prisma.ts`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `prisma` 싱글턴 (`import { prisma } from '../lib/prisma'`), `Post` 타입 (`import type { Post } from '@prisma/client'`)

- [ ] **Step 1: 의존성 설치**

**Prisma는 반드시 6.x로 고정한다.** 버전을 생략하면 v7이 설치되는데,
v7부터는 `datasource { url = env("DATABASE_URL") }`를 schema.prisma에 직접 쓰는 방식이
폐기되고 `prisma.config.ts` + driver adapter 방식이 강제된다.
아래 Step 3/4의 코드는 6.x 기준이므로 버전이 어긋나면 `P1012` 오류로 전부 무효가 된다.

```bash
npm install --save-exact @prisma/client@6.19.3
npm install express-session bcrypt multer sanitize-html
npm install --save-dev --save-exact prisma@6.19.3
npm install --save-dev @types/express-session @types/bcrypt @types/multer @types/sanitize-html
```

- [ ] **Step 2: `.gitignore`에 업로드 폴더 추가**

기존 `uploads/` 규칙은 프로젝트 루트 기준이라 `public/uploads/`에는 적용되지 않는다.
`# 업로드 파일 (고객 개인정보 포함)` 섹션 아래에 다음 두 줄을 추가한다.

```
public/uploads/
!public/uploads/.gitkeep
```

- [ ] **Step 3: `prisma/schema.prisma` 작성**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

/// 설계사 PR/포트폴리오 게시글 ("이야기")
/// 고객 접수 데이터와 무관하며, 설계사 본인이 작성하는 공개 콘텐츠만 저장한다.
model Post {
  id           Int      @id @default(autoincrement())
  title        String   @db.VarChar(200)
  /// 대표 이미지 저장 파일명 (UUID.ext) — 파일 자체가 아니라 파일명 문자열만 저장
  mainImage    String   @db.VarChar(255)
  /// Quill이 생성한 HTML. 본문 삽입 이미지는 <img src="/uploads/story/xxx.png"> 형태로 포함된다
  content      String   @db.Text
  /// 선택: 원문/출처 링크 — 상세 페이지에 "원문 보기" 버튼으로 노출
  sourceUrl    String?  @db.VarChar(500)
  /// 게시판 목록 상단 고정
  isPinned     Boolean  @default(false)
  /// 홈 슬라이드 노출 (isPinned과 별개)
  showOnHome   Boolean  @default(false)
  isPublished  Boolean  @default(true)
  /// 오름차순 — 값이 작을수록 위에 온다
  sortOrder    Int      @default(0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([isPinned, sortOrder])
  @@map("posts")
}
```

- [ ] **Step 4: `src/lib/prisma.ts` 작성**

```typescript
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

/**
 * Prisma 클라이언트 싱글턴.
 * tsx watch 개발 모드에서 핫 리로드 시 커넥션이 누적되는 것을 막기 위해 global에 캐싱한다.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isDevelopment ? ['warn', 'error'] : ['error'],
  });

if (env.isDevelopment) {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 5: 마이그레이션 생성 및 적용**

원격 DB(`bytebard.cloud:15432`)에 실제로 테이블을 만드는 단계다.

Run:
```bash
npx prisma migrate dev --name add_posts_table
```
Expected: `posts` 테이블 생성 성공, `prisma/migrations/` 디렉토리 생성

- [ ] **Step 6: 타입체크 확인**

Run: `npm run typecheck`
Expected: 통과 (에러 없음)

- [ ] **Step 7: 커밋**

```bash
mkdir -p public/uploads/story && touch public/uploads/.gitkeep
git add prisma src/lib/prisma.ts package.json package-lock.json .gitignore public/uploads/.gitkeep
git commit -m "feat: Post 모델 및 Prisma 클라이언트 추가"
```

---

### Task 2: 환경변수 검증 확장

**Files:**
- Modify: `src/config/env.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: 없음
- Produces: `env.DATABASE_URL`, `env.ADMIN_PASSWORD_HASH`, `env.SESSION_SECRET`, `env.MAX_IMAGE_SIZE_MB` (number), `env.MAX_IMAGE_SIZE_BYTES` (number)

- [ ] **Step 1: `src/config/env.ts`의 envSchema에 필드 추가**

`SITE_NAME` 정의 바로 아래, `AGENT_NAME` 위에 삽입한다.

```typescript
  // ── 게시판("이야기") 전용 ────────────────────────────
  // 고객 접수 데이터는 여전히 DB에 저장하지 않는다. 이 DB는 게시글 전용이다.
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL은 필수입니다.')
    .startsWith('postgres', 'DATABASE_URL은 postgresql:// 형식이어야 합니다.'),

  /** 관리자 비밀번호 bcrypt 해시 — 평문을 저장하지 않는다 */
  ADMIN_PASSWORD_HASH: z
    .string()
    .min(1, 'ADMIN_PASSWORD_HASH는 필수입니다.')
    .startsWith('$2', 'ADMIN_PASSWORD_HASH는 bcrypt 해시여야 합니다. ($2a$/$2b$로 시작)'),

  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET은 32자 이상이어야 합니다. (openssl rand -hex 32)'),

  MAX_IMAGE_SIZE_MB: z.coerce.number().int().positive().max(20).default(5),
```

- [ ] **Step 2: `env` export 객체에 파생값 추가**

`CONTACT_PHONE_HREF` 정의 아래에 추가한다.

```typescript
  /** 바이트 단위 최대 이미지 크기 */
  MAX_IMAGE_SIZE_BYTES: raw.MAX_IMAGE_SIZE_MB * 1024 * 1024,
```

- [ ] **Step 3: `.env.example`에 항목 추가**

파일 끝에 추가한다.

```bash
# ── 게시판("이야기") ──────────────────────────
# 게시글 저장용 DB. 고객 접수 데이터는 여전히 저장하지 않습니다.
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/insurance?schema=public

# 관리자 비밀번호 bcrypt 해시
#   생성: node -e "console.log(require('bcrypt').hashSync('원하는비밀번호', 10))"
ADMIN_PASSWORD_HASH=$2b$10$XXXXXXXXXXXXXXXXXXXXXX

# 세션 서명 키 (32자 이상)
#   생성: openssl rand -hex 32
SESSION_SECRET=change-me-to-a-long-random-string-at-least-32-chars

MAX_IMAGE_SIZE_MB=5            # 업로드 이미지 최대 크기(MB)
```

- [ ] **Step 4: 실제 `.env`에 값 채우기**

배포 서버와 로컬 모두 필요하다. `DATABASE_URL`은 이미 있으므로 나머지 3개만 추가한다.

```bash
node -e "console.log('ADMIN_PASSWORD_HASH=' + require('bcrypt').hashSync('바꿀비밀번호', 10))" >> .env
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env
echo "MAX_IMAGE_SIZE_MB=5" >> .env
```

- [ ] **Step 5: 검증 동작 확인**

Run: `npx tsx -e "import('./src/config/env').then(m => console.log('MAX_IMAGE_SIZE_BYTES =', m.env.MAX_IMAGE_SIZE_BYTES))"`
Expected: `MAX_IMAGE_SIZE_BYTES = 5242880` 출력 (환경변수 누락 시 명확한 에러 메시지와 함께 종료)

- [ ] **Step 6: 커밋**

```bash
git add src/config/env.ts .env.example
git commit -m "feat: 게시판용 환경변수 검증 추가"
```

---

### Task 3: 게시글 zod 스키마 및 sanitize 서비스

**Files:**
- Create: `src/schemas/post.schema.ts`
- Create: `src/services/sanitize.service.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `postSchema` (zod object), `PostInput` 타입 — 필드: `title: string`, `content: string`, `sourceUrl?: string`, `isPinned: boolean`, `showOnHome: boolean`, `isPublished: boolean`
  - `sanitizePostContent(html: string): string`

- [ ] **Step 1: `src/services/sanitize.service.ts` 작성**

```typescript
import sanitizeHtml from 'sanitize-html';

/**
 * 게시글 본문 HTML sanitize.
 *
 * 본문은 상세 페이지에서 EJS `<%- %>`로 이스케이프 없이 출력해야 서식이 살아난다.
 * 이는 저장형 XSS의 전형적인 경로이므로, 저장 시점에 서버에서 반드시 걸러낸다.
 * 관리자만 글을 쓰지만 세션 탈취나 외부 HTML 붙여넣기를 대비한 방어다.
 */
export function sanitizePostContent(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'p', 'br', 'strong', 'em', 'u', 's', 'blockquote',
      'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'img', 'span', 'div',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height', 'style'],
      span: ['class', 'style'],
      div: ['class', 'style'],
      p: ['class', 'style'],
      li: ['class'],
    },
    // javascript: 스킴 차단. 이미지는 우리 서버 업로드분만 허용한다.
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    // style 속성은 Quill이 정렬·크기 지정에 쓰므로 최소한만 허용
    allowedStyles: {
      '*': {
        'text-align': [/^left$|^right$|^center$|^justify$/],
        width: [/^\d+(?:px|%)$/],
        height: [/^\d+(?:px|%)$/],
      },
    },
    // 외부 링크는 새 창 + rel 보안 속성 강제
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
    },
  });
}
```

- [ ] **Step 2: `src/schemas/post.schema.ts` 작성**

```typescript
import { z } from 'zod';

/** 체크박스는 체크 시 'on'을 보내고 미체크 시 아예 전송되지 않는다. */
const checkbox = z.preprocess(
  (value) => value === 'on' || value === 'true' || value === true,
  z.boolean(),
);

/** 빈 문자열을 undefined로 (선택 입력 필드용) */
const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export const postSchema = z.object({
  title: z
    .string({ required_error: '제목을 입력해주세요.' })
    .trim()
    .min(2, '제목은 2자 이상 입력해주세요.')
    .max(200, '제목은 200자 이하로 입력해주세요.'),

  content: z
    .string({ required_error: '내용을 입력해주세요.' })
    .trim()
    .min(1, '내용을 입력해주세요.'),

  // zod의 .url()은 `javascript:`, `data:`, `vbscript:` 스킴도 유효한 URL로 통과시킨다.
  // 이 값은 상세 페이지의 "원문 보기" 링크 href에 그대로 들어가므로,
  // 스킴을 http/https로 명시적으로 제한하지 않으면 클릭 시 스크립트가 실행되는 XSS 경로가 된다.
  sourceUrl: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .url('올바른 URL 형식이 아닙니다. (http:// 또는 https://로 시작)')
      .max(500)
      .refine(
        (value) => /^https?:\/\//i.test(value),
        'http:// 또는 https:// 로 시작하는 주소만 입력할 수 있습니다.',
      )
      .optional(),
  ),

  isPinned: checkbox,
  showOnHome: checkbox,
  isPublished: checkbox,
});

/** req.body 타입은 별도 인터페이스 없이 zod에서 추론한다. */
export type PostInput = z.infer<typeof postSchema>;
```

- [ ] **Step 3: sanitize 동작 확인 (script 태그 제거)**

Run:
```bash
npx tsx -e "
import('./src/services/sanitize.service').then(({ sanitizePostContent }) => {
  const dirty = '<p>안녕</p><script>alert(1)</script><img src=x onerror=alert(1)>';
  const clean = sanitizePostContent(dirty);
  console.log('결과:', clean);
  console.log('script 제거:', !clean.includes('script'));
  console.log('onerror 제거:', !clean.includes('onerror'));
});
"
```
Expected: `script 제거: true`, `onerror 제거: true`

- [ ] **Step 4: 타입체크**

Run: `npm run typecheck`
Expected: 통과

- [ ] **Step 5: 커밋**

```bash
git add src/schemas/post.schema.ts src/services/sanitize.service.ts
git commit -m "feat: 게시글 스키마 및 본문 sanitize 추가"
```

---

### Task 4: 게시글 서비스 (CRUD + 정렬)

**Files:**
- Create: `src/services/post.service.ts`

**Interfaces:**
- Consumes: `prisma` (Task 1), `PostInput` (Task 3), `sanitizePostContent` (Task 3)
- Produces:
  - `listPublishedPosts(): Promise<Post[]>`
  - `getPublishedPost(id: number): Promise<Post | null>`
  - `listSlides(): Promise<Post[]>`
  - `listAllPosts(): Promise<Post[]>`
  - `getPost(id: number): Promise<Post | null>`
  - `createPost(input: PostInput & { mainImage: string }): Promise<Post>`
  - `updatePost(id: number, input: PostInput & { mainImage?: string }): Promise<Post>`
  - `deletePost(id: number): Promise<Post>`
  - `movePost(id: number, direction: 'up' | 'down'): Promise<void>`

- [ ] **Step 1: `src/services/post.service.ts` 작성**

```typescript
import type { Post, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { PostInput } from '../schemas/post.schema';
import { sanitizePostContent } from './sanitize.service';

/**
 * 공개 목록과 슬라이드가 공유하는 정렬 규칙.
 * 고정 글이 먼저, 그다음 sortOrder 오름차순(작을수록 위), 같으면 최신 글 먼저.
 */
const PUBLIC_ORDER: Prisma.PostOrderByWithRelationInput[] = [
  { isPinned: 'desc' },
  { sortOrder: 'asc' },
  { createdAt: 'desc' },
];

export function listPublishedPosts(): Promise<Post[]> {
  return prisma.post.findMany({
    where: { isPublished: true },
    orderBy: PUBLIC_ORDER,
  });
}

export function getPublishedPost(id: number): Promise<Post | null> {
  return prisma.post.findFirst({ where: { id, isPublished: true } });
}

/** 홈 슬라이드용 — 게시 중이면서 홈 노출로 지정된 글만 */
export function listSlides(): Promise<Post[]> {
  return prisma.post.findMany({
    where: { isPublished: true, showOnHome: true },
    orderBy: PUBLIC_ORDER,
  });
}

/** 관리자 목록 — 비공개 글도 모두 보인다 */
export function listAllPosts(): Promise<Post[]> {
  return prisma.post.findMany({ orderBy: PUBLIC_ORDER });
}

export function getPost(id: number): Promise<Post | null> {
  return prisma.post.findUnique({ where: { id } });
}

export function createPost(input: PostInput & { mainImage: string }): Promise<Post> {
  return prisma.post.create({
    data: {
      title: input.title,
      content: sanitizePostContent(input.content),
      mainImage: input.mainImage,
      sourceUrl: input.sourceUrl ?? null,
      isPinned: input.isPinned,
      showOnHome: input.showOnHome,
      isPublished: input.isPublished,
    },
  });
}

export function updatePost(
  id: number,
  input: PostInput & { mainImage?: string },
): Promise<Post> {
  return prisma.post.update({
    where: { id },
    data: {
      title: input.title,
      content: sanitizePostContent(input.content),
      // 새 이미지를 올리지 않았으면 기존 값을 유지한다
      ...(input.mainImage ? { mainImage: input.mainImage } : {}),
      sourceUrl: input.sourceUrl ?? null,
      isPinned: input.isPinned,
      showOnHome: input.showOnHome,
      isPublished: input.isPublished,
    },
  });
}

export function deletePost(id: number): Promise<Post> {
  return prisma.post.delete({ where: { id } });
}

/**
 * 노출 순서 변경.
 *
 * 신규 글은 sortOrder=0으로 저장되므로 값이 전부 같을 수 있다.
 * 그 상태로 스왑하면 아무 변화가 없으므로, 조정 시점에 현재 표시 순서대로
 * 1,2,3...을 재부여한 뒤 인접한 두 글의 값을 맞바꾼다.
 *
 * **고정 글과 일반 글은 서로 넘나들 수 없다.** 정렬이 isPinned를 최우선으로 보기 때문에,
 * 두 그룹에 걸친 스왑은 sortOrder만 바뀌고 화면 순서는 그대로여서 버튼이 먹통처럼 보인다.
 * 따라서 이동 대상을 같은 isPinned 그룹 안으로 한정한다.
 * (고정 여부 자체를 바꾸려면 관리자 목록의 '고정' 토글을 쓴다)
 */
export async function movePost(id: number, direction: 'up' | 'down'): Promise<void> {
  const posts = await listAllPosts();

  // 현재 표시 순서대로 1부터 재부여
  const renumbered = posts.map((post, index) => ({ ...post, sortOrder: index + 1 }));

  const currentIndex = renumbered.findIndex((post) => post.id === id);
  if (currentIndex === -1) return;

  const current = renumbered[currentIndex]!;

  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= renumbered.length) return; // 경계 밖이면 무시

  const target = renumbered[targetIndex]!;
  // 고정 그룹 경계를 넘는 이동은 화면상 아무 효과가 없으므로 수행하지 않는다
  if (target.isPinned !== current.isPinned) return;

  const swapped = [current.sortOrder, target.sortOrder];
  current.sortOrder = swapped[1]!;
  target.sortOrder = swapped[0]!;

  // 재부여된 값 전체를 한 트랜잭션으로 저장
  await prisma.$transaction(
    renumbered.map((post) =>
      prisma.post.update({ where: { id: post.id }, data: { sortOrder: post.sortOrder } }),
    ),
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `npm run typecheck`
Expected: 통과

- [ ] **Step 3: 커밋**

```bash
git add src/services/post.service.ts
git commit -m "feat: 게시글 서비스 (CRUD, 정렬, 순서 변경)"
```

---

### Task 5: 관리자 인증 (세션 + 로그인)

**Files:**
- Create: `src/middlewares/adminAuth.ts`
- Create: `src/controllers/admin.controller.ts`
- Create: `src/views/admin/login.ejs`
- Modify: `src/app.ts`
- Modify: `src/middlewares/rateLimiter.ts`

**Interfaces:**
- Consumes: `env.ADMIN_PASSWORD_HASH`, `env.SESSION_SECRET` (Task 2)
- Produces:
  - `requireAdmin: RequestHandler` — 미로그인 시 `/admin/login` 리다이렉트
  - `renderLogin`, `submitLogin`, `logout: RequestHandler`
  - `adminLoginLimiter` (rateLimiter.ts에 추가)
  - `req.session.isAdmin: boolean` (타입 확장 포함)

- [ ] **Step 1: `src/middlewares/adminAuth.ts` 작성**

```typescript
import type { RequestHandler } from 'express';

// express-session의 SessionData에 관리자 플래그를 추가한다.
declare module 'express-session' {
  interface SessionData {
    isAdmin?: boolean;
  }
}

/** 관리자 로그인 여부 확인 — 미로그인 시 로그인 페이지로 보낸다. */
export const requireAdmin: RequestHandler = (req, res, next) => {
  if (req.session.isAdmin) {
    next();
    return;
  }
  res.redirect('/admin/login');
};
```

- [ ] **Step 2: `src/middlewares/rateLimiter.ts`에 로그인 제한 추가**

파일 끝에 추가한다. 비밀번호 무차별 대입을 막는다.

```typescript
/**
 * 관리자 로그인 시도 제한 — IP당 15분에 10회.
 * 단일 비밀번호 구조라 무차별 대입에 취약하므로 반드시 필요하다.
 */
export const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).render('error', {
      pageTitle: '잠시 후 다시 시도해주세요',
      pageDescription: '로그인 시도가 너무 많습니다.',
      statusCode: 429,
      heading: '로그인 시도가 너무 많습니다',
      message: '보안을 위해 15분간 로그인이 제한됩니다.\n잠시 후 다시 시도해주세요.',
      showContact: false,
    });
  },
});
```

- [ ] **Step 3: `src/controllers/admin.controller.ts` 작성**

```typescript
import bcrypt from 'bcrypt';
import type { RequestHandler } from 'express';
import { env } from '../config/env';

export const renderLogin: RequestHandler = (_req, res) => {
  res.render('admin/login', {
    pageTitle: `관리자 로그인 | ${env.SITE_NAME}`,
    pageDescription: '관리자 전용 페이지입니다.',
    error: null,
  });
};

export const submitLogin: RequestHandler = async (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const isValid = password !== '' && (await bcrypt.compare(password, env.ADMIN_PASSWORD_HASH));

  if (!isValid) {
    res.status(401).render('admin/login', {
      pageTitle: `관리자 로그인 | ${env.SITE_NAME}`,
      pageDescription: '관리자 전용 페이지입니다.',
      error: '비밀번호가 올바르지 않습니다.',
    });
    return;
  }

  // 세션 고정 공격 방지 — 로그인 성공 시 세션 ID를 새로 발급한다
  req.session.regenerate((err) => {
    if (err) {
      console.error('[admin] 세션 재생성 실패', err);
      res.status(500).render('admin/login', {
        pageTitle: `관리자 로그인 | ${env.SITE_NAME}`,
        pageDescription: '관리자 전용 페이지입니다.',
        error: '로그인 처리 중 오류가 발생했습니다. 다시 시도해주세요.',
      });
      return;
    }
    req.session.isAdmin = true;
    res.redirect('/admin/story');
  });
};

export const logout: RequestHandler = (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
};
```

- [ ] **Step 4: `src/views/admin/login.ejs` 작성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <%- include('../partials/head') %>
  <meta name="robots" content="noindex">
</head>
<body class="bg-slate-50 font-sans text-slate-900 antialiased">
  <main class="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
    <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h1 class="text-xl font-black text-slate-900">관리자 로그인</h1>
      <p class="mt-2 text-sm text-slate-600">게시글을 관리하려면 비밀번호를 입력해주세요.</p>

      <% if (error) { %>
      <div role="alert" class="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3">
        <p class="text-sm font-medium text-red-700"><%= error %></p>
      </div>
      <% } %>

      <form action="/admin/login" method="post" class="mt-5 space-y-4">
        <div>
          <label for="password" class="block text-sm font-bold text-slate-800">비밀번호</label>
          <input type="password" id="password" name="password" required autocomplete="current-password"
                 class="mt-2 block h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20">
        </div>
        <button type="submit"
                class="flex h-12 w-full items-center justify-center rounded-2xl bg-brand-600 text-base font-extrabold text-white shadow-md transition hover:bg-brand-700">
          로그인
        </button>
      </form>

      <a href="/" class="mt-5 block text-center text-xs font-semibold text-slate-500 hover:text-slate-700">
        홈으로 돌아가기
      </a>
    </div>
  </main>
</body>
</html>
```

- [ ] **Step 5: `src/app.ts`에 세션 미들웨어 추가**

`import` 구문에 추가:
```typescript
import session from 'express-session';
```

`app.use(morgan(...))` 바로 아래에 삽입한다.
```typescript
  // 관리자 세션. 메모리 저장소를 쓰므로 재시작 시 로그아웃되지만,
  // 관리자 1인이 가끔 쓰는 용도라 세션 DB까지는 두지 않는다.
  app.use(
    session({
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        // 프로덕션은 nginx가 TLS를 종단하므로 secure 쿠키를 쓸 수 있다
        secure: env.isProduction,
        maxAge: 1000 * 60 * 60 * 12, // 12시간
      },
    }),
  );
```

- [ ] **Step 6: 타입체크**

Run: `npm run typecheck`
Expected: 통과

- [ ] **Step 7: 커밋**

```bash
git add src/middlewares/adminAuth.ts src/middlewares/rateLimiter.ts src/controllers/admin.controller.ts src/views/admin/login.ejs src/app.ts
git commit -m "feat: 관리자 세션 인증 및 로그인 페이지"
```

---

### Task 6: 이미지 업로드 미들웨어

**Files:**
- Create: `src/middlewares/upload.ts`

**Interfaces:**
- Consumes: `env.MAX_IMAGE_SIZE_BYTES` (Task 2)
- Produces:
  - `uploadMainImageSafe: RequestHandler` — 단일 파일, 필드명 `mainImage`. 에러를 던지지 않고 `req.uploadError`에 담는다
  - `uploadEditorImageSafe: RequestHandler` — 단일 파일, 필드명 `image`. 위와 동일
  - `STORY_UPLOAD_DIR: string` — 업로드 절대경로
  - `toUploadError(error: unknown): string | null` — multer 에러를 한국어 메시지로
  - `req.uploadError?: unknown` — Express Request 타입 확장

> **주의:** 래핑되지 않은 원본 uploader는 export하지 않는다.
> 원본을 라우터에 직접 붙이면 multer 에러가 글로벌 에러 핸들러로 튀어
> 사용자가 입력하던 내용이 전부 날아간다.

- [ ] **Step 1: `src/middlewares/upload.ts` 작성**

```typescript
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import type { RequestHandler } from 'express';
import { env } from '../config/env';

/**
 * 게시글 이미지 저장 경로 — 방문자에게 보여줘야 하므로 public 아래에 둔다.
 *
 * `app.ts`의 정적 서빙 루트(`PUBLIC_DIR`)와 **반드시 같은 기준**이어야 한다.
 * 그쪽이 `__dirname` 기반(개발: src/../public, 빌드: dist/../public)이므로 여기도 맞춘다.
 * `process.cwd()`를 쓰면 실행 위치가 프로젝트 루트가 아닐 때
 * 업로드는 성공하는데 정적 서빙 경로와 어긋나 이미지가 조용히 깨진다.
 */
export const STORY_UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'story');

fs.mkdirSync(STORY_UPLOAD_DIR, { recursive: true });

/**
 * 허용 MIME과 확장자 매핑.
 * 저장 파일명의 확장자는 원본이 아니라 이 표에서 가져온다 —
 * 원본 확장자를 신뢰하면 이중 확장자(a.jpg.html) 같은 우회가 가능하다.
 */
const ALLOWED: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
};

class UploadValidationError extends Error {}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, STORY_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    // 저장 파일명은 UUID로 재생성 — 경로 조작(path traversal) 차단
    const ext = ALLOWED[file.mimetype]?.[0] ?? '.bin';
    cb(null, `${randomUUID()}${ext}`);
  },
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** multer가 던진 에러 — 컨트롤러가 폼에 표시하기 위해 여기 담는다 */
      uploadError?: unknown;
    }
  }
}

const createUploader = (fieldName: string): RequestHandler =>
  multer({
    storage,
    limits: { fileSize: env.MAX_IMAGE_SIZE_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
      const allowedExts = ALLOWED[file.mimetype];
      if (!allowedExts) {
        cb(new UploadValidationError('JPG, PNG, WEBP 이미지만 업로드할 수 있습니다.'));
        return;
      }
      // MIME과 확장자를 모두 확인한다 (이중 검증)
      const ext = path.extname(file.originalname).toLowerCase();
      if (!allowedExts.includes(ext)) {
        cb(new UploadValidationError('파일 형식과 확장자가 일치하지 않습니다.'));
        return;
      }
      cb(null, true);
    },
  }).single(fieldName);

/**
 * multer 에러를 즉시 던지지 않고 req에 담아 다음 미들웨어로 넘긴다.
 * 그래야 컨트롤러가 사용자 입력값을 유지한 채 폼을 다시 그릴 수 있다.
 * (에러를 그대로 던지면 글로벌 에러 핸들러로 가서 입력 내용이 전부 날아간다)
 */
const captureUploadError =
  (uploader: RequestHandler): RequestHandler =>
  (req, res, next) => {
    uploader(req, res, (err: unknown) => {
      if (err) req.uploadError = err;
      next();
    });
  };

// 래핑된 것만 export한다 — 원본을 라우터에 직접 붙이면 위 문제가 발생한다
export const uploadMainImageSafe = captureUploadError(createUploader('mainImage'));
export const uploadEditorImageSafe = captureUploadError(createUploader('image'));

/** multer 에러를 사용자에게 보여줄 한국어 메시지로 변환한다. 업로드 에러가 아니면 null. */
export function toUploadError(error: unknown): string | null {
  if (error instanceof UploadValidationError) return error.message;
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return `이미지 크기는 최대 ${env.MAX_IMAGE_SIZE_MB}MB까지 업로드할 수 있습니다.`;
    }
    return '이미지 업로드에 실패했습니다.';
  }
  return null;
}
```

- [ ] **Step 2: 타입체크**

Run: `npm run typecheck`
Expected: 통과

- [ ] **Step 3: 커밋**

```bash
git add src/middlewares/upload.ts
git commit -m "feat: 게시글 이미지 업로드 미들웨어 (MIME·확장자 이중 검증)"
```

---

### Task 7: 공개 페이지 (목록·상세·슬라이드 API)

**Files:**
- Create: `src/controllers/story.controller.ts`
- Create: `src/views/story/list.ejs`
- Create: `src/views/story/detail.ejs`
- Modify: `src/routes/index.ts`
- Modify: `src/views/partials/header.ejs`
- Modify: `src/controllers/seo.controller.ts`

**Interfaces:**
- Consumes: `listPublishedPosts`, `getPublishedPost`, `listSlides` (Task 4)
- Produces: `renderStoryList`, `renderStoryDetail`, `slidesApi: RequestHandler`

- [ ] **Step 1: `src/controllers/story.controller.ts` 작성**

```typescript
import type { RequestHandler } from 'express';
import { env } from '../config/env';
import { getPublishedPost, listPublishedPosts, listSlides } from '../services/post.service';

export const renderStoryList: RequestHandler = async (_req, res) => {
  const posts = await listPublishedPosts();
  res.render('story/list', {
    pageTitle: `이야기 | ${env.SITE_NAME}`,
    pageDescription: `${env.AGENT_NAME} 설계사의 자격, 경력, 보험 상식과 상담 사례를 소개합니다.`,
    posts,
  });
};

/** PostgreSQL Int4 상한 — 이 값을 넘으면 조회 자체가 DB 에러가 되므로 미리 걸러낸다 */
const MAX_POST_ID = 2_147_483_647;

export const renderStoryDetail: RequestHandler = async (req, res, next) => {
  const id = Number(req.params.id);
  // 상한을 두지 않으면 Int4를 넘는 값이 Prisma까지 흘러가 500이 된다. 없는 글이므로 404가 맞다.
  if (!Number.isInteger(id) || id < 1 || id > MAX_POST_ID) {
    next(); // 숫자가 아니거나 범위 밖이면 404 핸들러로
    return;
  }

  const post = await getPublishedPost(id);
  if (!post) {
    next();
    return;
  }

  res.render('story/detail', {
    pageTitle: `${post.title} | ${env.SITE_NAME}`,
    pageDescription: post.title,
    ogImage: `${env.SITE_ORIGIN}/uploads/story/${post.mainImage}`,
    post,
  });
};

/** 홈 캐러셀이 fetch하는 JSON */
export const slidesApi: RequestHandler = async (_req, res) => {
  const posts = await listSlides();
  res.json({
    slides: posts.map((post) => ({
      id: post.id,
      title: post.title,
      imageUrl: `/uploads/story/${post.mainImage}`,
      href: `/story/${post.id}`,
    })),
  });
};
```

- [ ] **Step 2: `src/views/story/list.ejs` 작성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <%- include('../partials/head') %>
</head>
<body class="bg-slate-50 font-sans text-slate-900 antialiased selection:bg-brand-600 selection:text-white">
  <%- include('../partials/header') %>

  <main class="mx-auto max-w-3xl px-4 pb-28 sm:pb-8">
    <section class="mt-5">
      <h1 class="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">이야기</h1>
      <p class="mt-2 text-[15px] leading-relaxed text-slate-600">
        자격과 경력, 보험 상식, 그리고 실제 상담 이야기를 전해드립니다.
      </p>
    </section>

    <% if (posts.length === 0) { %>
      <div class="mt-8 rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p class="text-sm text-slate-500">아직 등록된 글이 없습니다.</p>
      </div>
    <% } else { %>
      <div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <% posts.forEach(function (post) { %>
        <a href="/story/<%= post.id %>"
           class="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
          <div class="aspect-[16/10] overflow-hidden bg-slate-100">
            <img src="/uploads/story/<%= post.mainImage %>" alt="<%= post.title %>" loading="lazy"
                 class="h-full w-full object-cover transition group-hover:scale-105">
          </div>
          <div class="p-4">
            <% if (post.isPinned) { %>
            <span class="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-bold text-brand-700">
              고정
            </span>
            <% } %>
            <h2 class="mt-1.5 text-[15px] font-bold leading-snug text-slate-900 group-hover:text-brand-700">
              <%= post.title %>
            </h2>
            <p class="mt-1.5 text-xs text-slate-400">
              <%= post.createdAt.toISOString().slice(0, 10).replace(/-/g, '.') %>
            </p>
          </div>
        </a>
        <% }); %>
      </div>
    <% } %>
  </main>

  <%- include('../partials/footer') %>
  <%- include('../partials/floating-contact') %>
  <script src="/js/app.js" defer></script>
</body>
</html>
```

- [ ] **Step 3: `src/views/story/detail.ejs` 작성**

본문은 서버에서 sanitize를 마쳤으므로 `<%- %>`로 출력한다.

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <%- include('../partials/head') %>
</head>
<body class="bg-slate-50 font-sans text-slate-900 antialiased selection:bg-brand-600 selection:text-white">
  <%- include('../partials/header') %>

  <main class="mx-auto max-w-3xl px-4 pb-28 sm:pb-8">
    <article class="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <img src="/uploads/story/<%= post.mainImage %>" alt="<%= post.title %>"
           class="w-full object-cover">

      <div class="p-5 sm:p-8">
        <h1 class="text-2xl font-black leading-snug tracking-tight text-slate-900"><%= post.title %></h1>
        <p class="mt-2 text-xs text-slate-400">
          <%= post.createdAt.toISOString().slice(0, 10).replace(/-/g, '.') %>
        </p>

        <!-- 본문은 저장 시점에 서버에서 sanitize를 마쳤다 (sanitize.service.ts) -->
        <div class="story-content mt-6 text-[15px] leading-relaxed text-slate-700">
          <%- post.content %>
        </div>

        <% if (post.sourceUrl) { %>
        <a href="<%= post.sourceUrl %>" target="_blank" rel="noopener noreferrer"
           class="mt-8 inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
          원문 보기 ↗
        </a>
        <% } %>
      </div>
    </article>

    <div class="mt-5">
      <a href="/story" class="inline-flex h-12 items-center justify-center rounded-xl bg-slate-100 px-6 text-sm font-bold text-slate-700 transition hover:bg-slate-200">
        목록으로
      </a>
    </div>
  </main>

  <%- include('../partials/footer') %>
  <%- include('../partials/floating-contact') %>
  <script src="/js/app.js" defer></script>

  <style>
    .story-content p { margin-bottom: 1rem; }
    .story-content h1 { font-size: 1.5rem; font-weight: 800; margin: 1.5rem 0 0.75rem; }
    .story-content h2 { font-size: 1.25rem; font-weight: 800; margin: 1.5rem 0 0.75rem; }
    .story-content h3 { font-size: 1.1rem; font-weight: 700; margin: 1.25rem 0 0.5rem; }
    .story-content ul { list-style: disc; padding-left: 1.25rem; margin-bottom: 1rem; }
    .story-content ol { list-style: decimal; padding-left: 1.25rem; margin-bottom: 1rem; }
    .story-content li { margin-bottom: 0.25rem; }
    .story-content a { color: #2563eb; text-decoration: underline; }
    .story-content img { max-width: 100%; height: auto; border-radius: 0.75rem; margin: 1rem 0; }
    .story-content blockquote {
      border-left: 3px solid #cbd5e1; padding-left: 1rem; color: #64748b; margin: 1rem 0;
    }
  </style>
</body>
</html>
```

- [ ] **Step 4: `src/routes/index.ts`에 공개 라우트 등록**

import 추가:
```typescript
import { renderStoryDetail, renderStoryList, slidesApi } from '../controllers/story.controller';
```

`// 개인정보처리방침` 위에 삽입:
```typescript
// 이야기 (게시판)
router.get('/story', asyncHandler(renderStoryList));
router.get('/story/:id', asyncHandler(renderStoryDetail));
router.get('/api/story/slides', asyncHandler(slidesApi));
```

- [ ] **Step 5: `src/views/partials/header.ejs` 네비에 "이야기" 추가**

`<nav>` 안 `설계신청` 링크 **앞**에 삽입한다.

```html
      <a href="/story"
         class="rounded-lg px-3 py-1.5 text-xs font-bold transition <%= currentPath.startsWith('/story') ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100' %>">
        이야기
      </a>
```

- [ ] **Step 6: `src/controllers/seo.controller.ts` 수정**

`STATIC_PATHS` 배열에서 `/consultation` 항목 위에 추가:
```typescript
  { path: '/story', changefreq: 'weekly', priority: '0.8' },
```

`robots` 핸들러의 `Disallow: /health` 아래에 추가:
```
Disallow: /admin
```

- [ ] **Step 7: 타입체크**

Run: `npm run typecheck`
Expected: 통과

- [ ] **Step 8: 서버 기동 후 페이지 확인**

Run:
```bash
npm run dev
# 다른 터미널에서:
curl -s -o /dev/null -w "/story → %{http_code}\n" http://localhost:3070/story
curl -s http://localhost:3070/api/story/slides
curl -s http://localhost:3070/robots.txt | grep admin
```
Expected: `/story → 200`, `{"slides":[]}`, `Disallow: /admin`

- [ ] **Step 9: 커밋**

```bash
git add src/controllers/story.controller.ts src/views/story src/routes/index.ts src/views/partials/header.ejs src/controllers/seo.controller.ts
git commit -m "feat: 이야기 게시판 공개 페이지 및 슬라이드 API"
```

---

### Task 8: 관리자 게시글 관리 페이지

**Files:**
- Create: `src/controllers/adminStory.controller.ts`
- Create: `src/routes/admin.routes.ts`
- Create: `src/views/admin/list.ejs`
- Create: `src/views/admin/form.ejs`
- Create: `public/js/admin-editor.js`
- Modify: `src/routes/index.ts`
- Modify: `src/app.ts`

> Quill CDN은 관리자 폼에서만 필요하므로 공용 `head.ejs`가 아니라
> `admin/form.ejs`에 직접 넣는다. 공개 페이지에 불필요한 스크립트를 로드하지 않기 위함이다.

**Interfaces:**
- Consumes: `requireAdmin` (Task 5), `uploadMainImage`/`uploadEditorImage`/`toUploadError`/`STORY_UPLOAD_DIR` (Task 6), post.service 전체 (Task 4), `postSchema` (Task 3)
- Produces: 관리자 라우터 (`adminRouter`)

- [ ] **Step 1: `src/controllers/adminStory.controller.ts` 작성**

```typescript
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Request, RequestHandler, Response } from 'express';
import { env } from '../config/env';
import { toFieldErrors, type FieldErrors } from '../schemas/common';
import { postSchema } from '../schemas/post.schema';
import { STORY_UPLOAD_DIR, toUploadError } from '../middlewares/upload';
import {
  createPost,
  deletePost,
  getPost,
  listAllPosts,
  movePost,
  updatePost,
} from '../services/post.service';

interface FormValues {
  title: string;
  content: string;
  sourceUrl: string;
  isPinned: boolean;
  showOnHome: boolean;
  isPublished: boolean;
  mainImage: string;
}

const EMPTY_VALUES: FormValues = {
  title: '',
  content: '',
  sourceUrl: '',
  isPinned: false,
  showOnHome: false,
  isPublished: true,
  mainImage: '',
};

const pickValues = (body: Request['body'], mainImage = ''): FormValues => ({
  title: typeof body?.title === 'string' ? body.title : '',
  content: typeof body?.content === 'string' ? body.content : '',
  sourceUrl: typeof body?.sourceUrl === 'string' ? body.sourceUrl : '',
  isPinned: body?.isPinned === 'on',
  showOnHome: body?.showOnHome === 'on',
  isPublished: body?.isPublished === 'on',
  mainImage,
});

const renderForm = (
  res: Response,
  options: {
    mode: 'create' | 'edit';
    id?: number;
    values?: FormValues;
    errors?: FieldErrors;
    formError?: string | null;
    status?: number;
  },
): void => {
  res.status(options.status ?? 200).render('admin/form', {
    pageTitle: `${options.mode === 'create' ? '글 작성' : '글 수정'} | ${env.SITE_NAME}`,
    pageDescription: '관리자 전용 페이지입니다.',
    mode: options.mode,
    postId: options.id ?? null,
    values: options.values ?? EMPTY_VALUES,
    errors: options.errors ?? {},
    formError: options.formError ?? null,
  });
};

/** 업로드된 파일을 지운다. 이미 없으면 조용히 넘어간다. */
const removeUpload = async (fileName: string): Promise<void> => {
  if (!fileName) return;
  try {
    // 파일명만 취해 경로 조작을 막는다
    await fs.unlink(path.join(STORY_UPLOAD_DIR, path.basename(fileName)));
  } catch {
    // 파일이 이미 없는 경우는 무시
  }
};

// ── 목록 ────────────────────────────────────────────

export const renderAdminList: RequestHandler = async (_req, res) => {
  const posts = await listAllPosts();
  res.render('admin/list', {
    pageTitle: `게시글 관리 | ${env.SITE_NAME}`,
    pageDescription: '관리자 전용 페이지입니다.',
    posts,
  });
};

// ── 작성 ────────────────────────────────────────────

export const renderCreateForm: RequestHandler = (_req, res) => {
  renderForm(res, { mode: 'create' });
};

export const submitCreate: RequestHandler = async (req, res) => {
  const uploadError = toUploadError(req.uploadError);
  if (uploadError) {
    renderForm(res, {
      mode: 'create',
      status: 400,
      values: pickValues(req.body),
      formError: uploadError,
    });
    return;
  }

  const parsed = postSchema.safeParse(req.body);
  const fileName = req.file?.filename ?? '';

  if (!parsed.success || !fileName) {
    // 검증 실패 시 이미 올라간 파일을 지워 고아 파일을 만들지 않는다
    await removeUpload(fileName);
    renderForm(res, {
      mode: 'create',
      status: 400,
      values: pickValues(req.body),
      errors: parsed.success ? {} : toFieldErrors(parsed.error),
      formError: fileName ? null : '대표 이미지를 첨부해주세요.',
    });
    return;
  }

  await createPost({ ...parsed.data, mainImage: fileName });
  res.redirect('/admin/story');
};

// ── 수정 ────────────────────────────────────────────

export const renderEditForm: RequestHandler = async (req, res, next) => {
  const id = Number(req.params.id);
  const post = Number.isInteger(id) ? await getPost(id) : null;
  if (!post) {
    next();
    return;
  }

  renderForm(res, {
    mode: 'edit',
    id: post.id,
    values: {
      title: post.title,
      content: post.content,
      sourceUrl: post.sourceUrl ?? '',
      isPinned: post.isPinned,
      showOnHome: post.showOnHome,
      isPublished: post.isPublished,
      mainImage: post.mainImage,
    },
  });
};

export const submitEdit: RequestHandler = async (req, res, next) => {
  const id = Number(req.params.id);
  const existing = Number.isInteger(id) ? await getPost(id) : null;
  if (!existing) {
    next();
    return;
  }

  const newFileName = req.file?.filename ?? '';

  const uploadError = toUploadError(req.uploadError);
  if (uploadError) {
    renderForm(res, {
      mode: 'edit',
      id,
      status: 400,
      values: pickValues(req.body, existing.mainImage),
      formError: uploadError,
    });
    return;
  }

  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) {
    await removeUpload(newFileName);
    renderForm(res, {
      mode: 'edit',
      id,
      status: 400,
      values: pickValues(req.body, existing.mainImage),
      errors: toFieldErrors(parsed.error),
    });
    return;
  }

  await updatePost(id, {
    ...parsed.data,
    ...(newFileName ? { mainImage: newFileName } : {}),
  });

  // 새 이미지로 교체했다면 이전 파일을 정리한다
  if (newFileName) await removeUpload(existing.mainImage);

  res.redirect('/admin/story');
};

// ── 삭제 / 순서 ─────────────────────────────────────

export const submitDelete: RequestHandler = async (req, res, next) => {
  const id = Number(req.params.id);
  const post = Number.isInteger(id) ? await getPost(id) : null;
  if (!post) {
    next();
    return;
  }

  await deletePost(id);
  // 대표 이미지만 삭제한다. 본문 이미지는 스펙상 의도적으로 남긴다.
  await removeUpload(post.mainImage);
  res.redirect('/admin/story');
};

export const submitMove: RequestHandler = async (req, res) => {
  const id = Number(req.params.id);
  const direction = req.params.direction === 'up' ? 'up' : 'down';
  if (Number.isInteger(id)) await movePost(id, direction);
  res.redirect('/admin/story');
};

/** 목록에서 게시/고정/홈노출을 즉시 토글한다. */
export const submitToggle: RequestHandler = async (req, res, next) => {
  const id = Number(req.params.id);
  const field = req.params.field;
  const post = Number.isInteger(id) ? await getPost(id) : null;

  if (!post || !['isPinned', 'showOnHome', 'isPublished'].includes(field ?? '')) {
    next();
    return;
  }

  const key = field as 'isPinned' | 'showOnHome' | 'isPublished';
  await updatePost(id, {
    title: post.title,
    content: post.content,
    sourceUrl: post.sourceUrl ?? undefined,
    isPinned: post.isPinned,
    showOnHome: post.showOnHome,
    isPublished: post.isPublished,
    [key]: !post[key],
  });

  res.redirect('/admin/story');
};

// ── 에디터 이미지 업로드 (JSON 응답) ────────────────

export const uploadImageApi: RequestHandler = (req, res) => {
  const uploadError = toUploadError(req.uploadError);
  if (uploadError) {
    res.status(400).json({ success: false, msg: uploadError });
    return;
  }
  if (!req.file) {
    res.status(400).json({ success: false, msg: '이미지를 선택해주세요.' });
    return;
  }
  res.json({ success: true, url: `/uploads/story/${req.file.filename}` });
};
```

- [ ] **Step 2: `src/views/admin/list.ejs` 작성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <%- include('../partials/head') %>
  <meta name="robots" content="noindex">
</head>
<body class="bg-slate-50 font-sans text-slate-900 antialiased">
  <header class="border-b border-slate-200 bg-white">
    <div class="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
      <h1 class="text-base font-extrabold">게시글 관리</h1>
      <div class="flex items-center gap-2">
        <a href="/story" target="_blank" class="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
          사이트 보기 ↗
        </a>
        <form action="/admin/logout" method="post">
          <button type="submit" class="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
            로그아웃
          </button>
        </form>
      </div>
    </div>
  </header>

  <main class="mx-auto max-w-5xl px-4 py-8">
    <div class="mb-4 flex justify-end">
      <a href="/admin/story/new"
         class="inline-flex h-11 items-center justify-center rounded-xl bg-brand-600 px-5 text-sm font-extrabold text-white shadow-md transition hover:bg-brand-700">
        + 새 글 작성
      </a>
    </div>

    <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table class="w-full min-w-[720px] text-sm">
        <thead class="bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            <th class="px-4 py-3 font-semibold">제목</th>
            <th class="px-3 py-3 font-semibold">게시</th>
            <th class="px-3 py-3 font-semibold">고정</th>
            <th class="px-3 py-3 font-semibold">홈노출</th>
            <th class="px-3 py-3 font-semibold">순서</th>
            <th class="px-3 py-3 font-semibold">관리</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <% if (posts.length === 0) { %>
          <tr><td colspan="6" class="px-4 py-10 text-center text-slate-400">등록된 글이 없습니다.</td></tr>
          <% } %>
          <% posts.forEach(function (post) { %>
          <tr>
            <td class="px-4 py-3">
              <a href="/admin/story/<%= post.id %>/edit" class="font-semibold text-slate-800 hover:text-brand-700">
                <%= post.title %>
              </a>
            </td>
            <td class="px-3 py-3">
              <form action="/admin/story/<%= post.id %>/toggle/isPublished" method="post">
                <button type="submit" class="rounded-md px-2 py-1 text-xs font-bold <%= post.isPublished ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500' %>">
                  <%= post.isPublished ? '게시중' : '비공개' %>
                </button>
              </form>
            </td>
            <td class="px-3 py-3">
              <form action="/admin/story/<%= post.id %>/toggle/isPinned" method="post">
                <button type="submit" class="rounded-md px-2 py-1 text-xs font-bold <%= post.isPinned ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-500' %>">
                  <%= post.isPinned ? 'ON' : 'OFF' %>
                </button>
              </form>
            </td>
            <td class="px-3 py-3">
              <form action="/admin/story/<%= post.id %>/toggle/showOnHome" method="post">
                <button type="submit" class="rounded-md px-2 py-1 text-xs font-bold <%= post.showOnHome ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500' %>">
                  <%= post.showOnHome ? 'ON' : 'OFF' %>
                </button>
              </form>
            </td>
            <td class="px-3 py-3">
              <div class="flex gap-1">
                <form action="/admin/story/<%= post.id %>/move/up" method="post">
                  <button type="submit" class="rounded-md bg-slate-100 px-2 py-1 text-xs hover:bg-slate-200">▲</button>
                </form>
                <form action="/admin/story/<%= post.id %>/move/down" method="post">
                  <button type="submit" class="rounded-md bg-slate-100 px-2 py-1 text-xs hover:bg-slate-200">▼</button>
                </form>
              </div>
            </td>
            <td class="px-3 py-3">
              <form action="/admin/story/<%= post.id %>/delete" method="post"
                    onsubmit="return confirm('정말 삭제하시겠습니까? 되돌릴 수 없습니다.');">
                <button type="submit" class="rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">
                  삭제
                </button>
              </form>
            </td>
          </tr>
          <% }); %>
        </tbody>
      </table>
    </div>
  </main>
</body>
</html>
```

- [ ] **Step 3: `src/views/admin/form.ejs` 작성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <%- include('../partials/head') %>
  <meta name="robots" content="noindex">
  <link href="https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css" rel="stylesheet">
</head>
<body class="bg-slate-50 font-sans text-slate-900 antialiased">
  <header class="border-b border-slate-200 bg-white">
    <div class="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
      <a href="/admin/story" class="text-sm font-semibold text-slate-500 hover:text-slate-800">← 목록</a>
      <h1 class="text-base font-extrabold"><%= mode === 'create' ? '글 작성' : '글 수정' %></h1>
      <span class="w-12"></span>
    </div>
  </header>

  <main class="mx-auto max-w-3xl px-4 py-8">
    <% if (formError) { %>
    <div role="alert" class="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4">
      <p class="text-sm font-medium text-red-700"><%= formError %></p>
    </div>
    <% } %>

    <form action="<%= mode === 'create' ? '/admin/story' : '/admin/story/' + postId %>"
          method="post" enctype="multipart/form-data"
          class="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">

      <div>
        <label for="title" class="block text-sm font-bold text-slate-800">제목 <span class="text-red-500">*</span></label>
        <input type="text" id="title" name="title" required maxlength="200" value="<%= values.title %>"
               class="mt-2 block h-12 w-full rounded-xl border bg-white px-4 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 <%= errors.title ? 'border-red-400' : 'border-slate-300' %>">
        <% if (errors.title) { %><p class="mt-1.5 text-sm font-medium text-red-600"><%= errors.title %></p><% } %>
      </div>

      <div>
        <label for="mainImage" class="block text-sm font-bold text-slate-800">
          대표 이미지 <% if (mode === 'create') { %><span class="text-red-500">*</span><% } %>
        </label>
        <% if (values.mainImage) { %>
        <div class="mt-2 flex items-center gap-3">
          <img src="/uploads/story/<%= values.mainImage %>" alt="현재 대표 이미지"
               class="h-20 w-32 rounded-lg border border-slate-200 object-cover">
          <p class="text-xs text-slate-500">새 파일을 선택하면 교체됩니다.</p>
        </div>
        <% } %>
        <input type="file" id="mainImage" name="mainImage" accept="image/jpeg,image/png,image/webp"
               <%= mode === 'create' ? 'required' : '' %>
               class="mt-2 block w-full rounded-xl border border-slate-300 bg-white p-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-brand-700">
        <p class="mt-1.5 text-xs text-slate-400">JPG, PNG, WEBP만 가능합니다.</p>
      </div>

      <div>
        <label class="block text-sm font-bold text-slate-800">내용 <span class="text-red-500">*</span></label>
        <!-- Quill이 이 div에 붙고, 편집 결과를 아래 hidden input에 동기화한다 -->
        <div id="editor" class="mt-2 bg-white"><%- values.content %></div>
        <input type="hidden" name="content" id="content" value="<%= values.content %>">
        <% if (errors.content) { %><p class="mt-1.5 text-sm font-medium text-red-600"><%= errors.content %></p><% } %>
      </div>

      <div>
        <label for="sourceUrl" class="block text-sm font-bold text-slate-800">원문 링크 <span class="text-xs font-normal text-slate-400">(선택)</span></label>
        <input type="url" id="sourceUrl" name="sourceUrl" maxlength="500" value="<%= values.sourceUrl %>"
               placeholder="https://example.com/article"
               class="mt-2 block h-12 w-full rounded-xl border bg-white px-4 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 <%= errors.sourceUrl ? 'border-red-400' : 'border-slate-300' %>">
        <% if (errors.sourceUrl) { %><p class="mt-1.5 text-sm font-medium text-red-600"><%= errors.sourceUrl %></p><% } %>
      </div>

      <div class="flex flex-wrap gap-4 rounded-2xl bg-slate-50/70 p-4">
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isPublished" <%= values.isPublished ? 'checked' : '' %>
                 class="h-4 w-4 rounded border-slate-300 text-brand-600">
          게시하기
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isPinned" <%= values.isPinned ? 'checked' : '' %>
                 class="h-4 w-4 rounded border-slate-300 text-brand-600">
          상단 고정
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" name="showOnHome" <%= values.showOnHome ? 'checked' : '' %>
                 class="h-4 w-4 rounded border-slate-300 text-brand-600">
          홈 슬라이드 노출
        </label>
      </div>

      <button type="submit"
              class="flex h-14 w-full items-center justify-center rounded-2xl bg-brand-600 text-base font-extrabold text-white shadow-md transition hover:bg-brand-700">
        저장
      </button>
    </form>
  </main>

  <script src="https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.js"></script>
  <script src="/js/admin-editor.js" defer></script>
</body>
</html>
```

- [ ] **Step 4: `public/js/admin-editor.js` 작성**

```javascript
/* 관리자 글 작성/수정용 Quill 에디터 초기화 */
(function () {
  'use strict';

  var editorEl = document.getElementById('editor');
  var contentInput = document.getElementById('content');
  if (!editorEl || !contentInput || typeof Quill === 'undefined') return;

  var quill = new Quill(editorEl, {
    theme: 'snow',
    placeholder: '내용을 입력해주세요.',
    modules: {
      toolbar: {
        container: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          [{ align: [] }],
          ['link', 'image'],
          ['blockquote'],
          ['clean'],
        ],
        handlers: {
          // 기본 동작(base64 삽입) 대신 서버에 업로드하고 URL을 삽입한다
          image: function () {
            var input = document.createElement('input');
            input.setAttribute('type', 'file');
            input.setAttribute('accept', 'image/jpeg,image/png,image/webp');
            input.click();

            input.onchange = function () {
              var file = input.files && input.files[0];
              if (!file) return;

              var formData = new FormData();
              formData.append('image', file);

              fetch('/admin/upload/image', { method: 'POST', body: formData })
                .then(function (res) { return res.json(); })
                .then(function (data) {
                  if (!data.success || !data.url) {
                    window.alert(data.msg || '이미지 업로드에 실패했습니다.');
                    return;
                  }
                  var range = quill.getSelection(true);
                  quill.insertEmbed(range.index, 'image', data.url);
                  quill.setSelection(range.index + 1);
                })
                .catch(function () {
                  window.alert('이미지 업로드 중 오류가 발생했습니다.');
                });
            };
          },
        },
      },
    },
  });

  // 제출 직전에 에디터 내용을 hidden input으로 옮긴다
  var form = editorEl.closest('form');
  if (form) {
    form.addEventListener('submit', function () {
      // 내용이 비어 있으면 Quill은 '<p><br></p>'를 반환하므로 빈 문자열로 정규화한다
      var html = quill.getSemanticHTML().trim();
      contentInput.value = html === '<p></p>' || html === '<p><br></p>' ? '' : quill.root.innerHTML;
    });
  }
})();
```

- [ ] **Step 5: `src/routes/admin.routes.ts` 작성**

```typescript
import { Router } from 'express';
import { logout, renderLogin, submitLogin } from '../controllers/admin.controller';
import {
  renderAdminList,
  renderCreateForm,
  renderEditForm,
  submitCreate,
  submitDelete,
  submitEdit,
  submitMove,
  submitToggle,
  uploadImageApi,
} from '../controllers/adminStory.controller';
import { requireAdmin } from '../middlewares/adminAuth';
import { asyncHandler } from '../middlewares/errorHandler';
import { adminLoginLimiter } from '../middlewares/rateLimiter';
import { uploadEditorImageSafe, uploadMainImageSafe } from '../middlewares/upload';

export const adminRouter = Router();

// 로그인은 인증 없이 접근 가능해야 한다
adminRouter.get('/login', renderLogin);
adminRouter.post('/login', adminLoginLimiter, asyncHandler(submitLogin));
adminRouter.post('/logout', logout);

// 이 아래는 전부 로그인 필요
adminRouter.use(requireAdmin);

adminRouter.get('/story', asyncHandler(renderAdminList));
adminRouter.get('/story/new', renderCreateForm);
adminRouter.post('/story', uploadMainImageSafe, asyncHandler(submitCreate));
adminRouter.get('/story/:id/edit', asyncHandler(renderEditForm));
adminRouter.post('/story/:id', uploadMainImageSafe, asyncHandler(submitEdit));
adminRouter.post('/story/:id/delete', asyncHandler(submitDelete));
adminRouter.post('/story/:id/move/:direction', asyncHandler(submitMove));
adminRouter.post('/story/:id/toggle/:field', asyncHandler(submitToggle));

adminRouter.post('/upload/image', uploadEditorImageSafe, uploadImageApi);
```

- [ ] **Step 6: `src/routes/index.ts`에 관리자 라우터 등록**

import 추가:
```typescript
import { adminRouter } from './admin.routes';
```

`// 운영` 섹션 위에 삽입:
```typescript
// 관리자
router.use('/admin', adminRouter);
```

- [ ] **Step 7: `src/app.ts` CSP에 Quill CDN 허용 추가**

`scriptSrc`와 `styleSrc` 배열에 `https://cdn.jsdelivr.net`을 추가한다.
`styleSrc`에는 이미 있으므로 `scriptSrc`만 수정하면 된다.

```typescript
          scriptSrc: ["'self'", 'https://cdn.tailwindcss.com', 'https://cdn.jsdelivr.net', "'unsafe-eval'"],
```

- [ ] **Step 8: 타입체크**

Run: `npm run typecheck`
Expected: 통과

- [ ] **Step 9: 커밋**

```bash
git add src/controllers/adminStory.controller.ts src/routes/admin.routes.ts src/views/admin src/middlewares/upload.ts src/routes/index.ts src/app.ts public/js/admin-editor.js
git commit -m "feat: 관리자 게시글 관리 페이지 (CRUD, Quill 에디터)"
```

---

### Task 9: 홈 슬라이드 캐러셀

**Files:**
- Create: `public/js/story-slider.js`
- Modify: `src/views/index.ejs`

**Interfaces:**
- Consumes: `GET /api/story/slides` (Task 7)
- Produces: 없음 (최종 UI)

- [ ] **Step 1: `public/js/story-slider.js` 작성**

```javascript
/* 홈 "이야기" 슬라이드 — 자동 순환 + hover/touch 정지 + 스와이프 */
(function () {
  'use strict';

  var AUTO_MS = 5000;          // 자동 전환 간격
  var RESUME_DELAY_MS = 3000;  // 터치 조작 후 재개까지 대기
  var SWIPE_THRESHOLD = 50;    // 스와이프로 인정할 최소 이동 px

  var section = document.getElementById('story-slider');
  if (!section) return;

  var track = section.querySelector('[data-slider-track]');
  var dotsWrap = section.querySelector('[data-slider-dots]');
  if (!track) return;

  var slides = [];
  var index = 0;
  var timer = null;
  var resumeTimer = null;

  function render() {
    track.innerHTML = slides
      .map(function (slide) {
        return (
          '<a href="' + slide.href + '" class="slider-item absolute inset-0 block opacity-0 transition-opacity duration-500">' +
          '<img src="' + slide.imageUrl + '" alt="" class="h-full w-full object-cover">' +
          '<div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-5">' +
          '<p class="text-base font-bold text-white">' + slide.title + '</p>' +
          '</div></a>'
        );
      })
      .join('');

    if (dotsWrap) {
      dotsWrap.innerHTML = slides
        .map(function (_, i) {
          return '<button type="button" data-dot="' + i + '" aria-label="' + (i + 1) + '번째 슬라이드" ' +
                 'class="h-1.5 w-1.5 rounded-full bg-white/50 transition"></button>';
        })
        .join('');
      dotsWrap.addEventListener('click', function (event) {
        var dot = event.target.getAttribute('data-dot');
        if (dot === null) return;
        show(Number(dot));
        restart();
      });
    }

    show(0);
  }

  function show(next) {
    // 마지막 다음은 처음으로, 처음 이전은 마지막으로 순환한다
    index = (next + slides.length) % slides.length;
    var items = track.querySelectorAll('.slider-item');
    for (var i = 0; i < items.length; i += 1) {
      items[i].style.opacity = i === index ? '1' : '0';
      items[i].style.zIndex = i === index ? '1' : '0';
    }
    if (dotsWrap) {
      var dots = dotsWrap.querySelectorAll('[data-dot]');
      for (var j = 0; j < dots.length; j += 1) {
        dots[j].className = j === index
          ? 'h-1.5 w-4 rounded-full bg-white transition'
          : 'h-1.5 w-1.5 rounded-full bg-white/50 transition';
      }
    }
  }

  function start() {
    stop();
    if (slides.length < 2) return; // 1장이면 순환할 이유가 없다
    timer = setInterval(function () { show(index + 1); }, AUTO_MS);
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function restart() {
    stop();
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(start, RESUME_DELAY_MS);
  }

  fetch('/api/story/slides')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      slides = (data && data.slides) || [];
      // 노출할 글이 없으면 섹션 자체를 숨긴다 (빈 캐러셀 방지)
      if (slides.length === 0) return;

      section.classList.remove('hidden');
      render();
      start();

      // 데스크톱: 마우스를 올리면 멈추고 떼면 다시 돈다
      section.addEventListener('mouseenter', stop);
      section.addEventListener('mouseleave', start);

      // 모바일: 터치 중에는 멈추고, 뗀 뒤 잠시 후 재개한다
      var touchStartX = 0;
      section.addEventListener('touchstart', function (e) {
        stop();
        touchStartX = e.changedTouches[0].screenX;
      }, { passive: true });

      section.addEventListener('touchend', function (e) {
        var deltaX = e.changedTouches[0].screenX - touchStartX;
        if (Math.abs(deltaX) >= SWIPE_THRESHOLD) {
          // 왼쪽으로 밀면 다음, 오른쪽으로 밀면 이전
          show(deltaX < 0 ? index + 1 : index - 1);
        }
        restart();
      }, { passive: true });
    })
    .catch(function () {
      // 슬라이드는 부가 요소이므로 실패해도 페이지 나머지에 영향을 주지 않는다
    });
})();
```

- [ ] **Step 2: `src/views/index.ejs`에 슬라이드 섹션 추가**

프로필 카드 `</section>` 바로 아래, "즉시 연결" 섹션 위에 삽입한다.
초기에는 `hidden`이고, 슬라이드가 있을 때만 JS가 노출시킨다.

```html
    <!-- 이야기 슬라이드 (노출할 글이 없으면 JS가 숨긴 채로 둔다) -->
    <section id="story-slider" class="mt-8 hidden">
      <div class="mb-3 flex items-end justify-between px-1">
        <h2 class="text-lg font-bold text-slate-900">이야기</h2>
        <a href="/story" class="text-xs font-semibold text-brand-600 hover:underline">전체 보기 →</a>
      </div>
      <div class="relative aspect-[16/10] overflow-hidden rounded-3xl bg-slate-200 shadow-sm">
        <div data-slider-track class="absolute inset-0"></div>
        <div data-slider-dots class="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5"></div>
      </div>
    </section>
```

`<script src="/js/app.js" defer></script>` 아래에 추가:
```html
  <script src="/js/story-slider.js" defer></script>
```

- [ ] **Step 3: 서버 기동 후 슬라이드 동작 확인**

Run:
```bash
npm run dev
# 다른 터미널: 슬라이드 없을 때 섹션이 숨겨져 있는지
curl -s http://localhost:3070/ | grep -c 'id="story-slider"'
```
Expected: `1` (마크업은 존재하고 `hidden` 클래스가 붙어 있음)

관리자에서 글을 하나 만들고 "홈 슬라이드 노출"을 켠 뒤 홈을 새로고침하면 슬라이드가 보여야 한다.

- [ ] **Step 4: 커밋**

```bash
git add public/js/story-slider.js src/views/index.ejs
git commit -m "feat: 홈 이야기 슬라이드 캐러셀 (자동 순환, 스와이프)"
```

---

### Task 10: e2e 테스트 및 문서화

**Files:**
- Create: `scripts/e2e-story.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `.env.example` (Task 2에서 이미 수정, 여기서는 확인만)

**Interfaces:**
- Consumes: 전체 앱
- Produces: `npm run test:story`

- [ ] **Step 1: `scripts/e2e-story.ts` 작성**

실제 DB를 쓰되, 테스트 후 만든 데이터를 정리한다.

```typescript
/**
 * "이야기" 게시판 e2e 검증 — `npm run test:story`
 *
 * 실제 DB에 연결해 테스트 게시글을 만들고, 끝나면 지운다.
 * Discord 웹훅은 건드리지 않는다.
 */
import http from 'node:http';

const APP_PORT = 39992;

process.env.PORT = String(APP_PORT);
process.env.NODE_ENV = 'development';
// 접수 웹훅은 이 테스트에서 쓰지 않지만 env 검증을 통과해야 하므로 더미를 넣는다
process.env.DISCORD_WEBHOOK_GENERAL = 'http://127.0.0.1:1/hook';
process.env.DISCORD_WEBHOOK_CONSULTATION = 'http://127.0.0.1:1/hook';
process.env.DISCORD_WEBHOOK_CLAIM = 'http://127.0.0.1:1/hook';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

const base = `http://127.0.0.1:${APP_PORT}`;

async function main() {
  const { createApp } = await import('../src/app');
  const { prisma } = await import('../src/lib/prisma');
  const { sanitizePostContent } = await import('../src/services/sanitize.service');
  const { createPost, listSlides, listPublishedPosts } = await import('../src/services/post.service');

  const server = createApp().listen(APP_PORT);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));

  const createdIds: number[] = [];

  try {
    // ── 1. 관리자 접근 제어 ──────────────────────────
    console.log('\n[1] 관리자 접근 제어');
    const noAuth = await fetch(`${base}/admin/story`, { redirect: 'manual' });
    check('미로그인 → 302 리다이렉트', noAuth.status === 302, `실제 ${noAuth.status}`);
    check('로그인 페이지로 이동', noAuth.headers.get('location') === '/admin/login');

    const badLogin = await fetch(`${base}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ password: 'wrong-password-here' }).toString(),
      redirect: 'manual',
    });
    check('잘못된 비밀번호 → 401', badLogin.status === 401, `실제 ${badLogin.status}`);

    // ── 2. XSS sanitize ─────────────────────────────
    console.log('\n[2] 본문 sanitize');
    const dirty = '<p>정상 문단</p><script>alert(1)</script><img src="x" onerror="alert(1)">';
    const clean = sanitizePostContent(dirty);
    check('script 태그 제거', !clean.includes('<script'));
    check('onerror 속성 제거', !clean.includes('onerror'));
    check('정상 문단은 유지', clean.includes('정상 문단'));

    // ── 3. 공개 노출 규칙 ───────────────────────────
    console.log('\n[3] 공개 노출 규칙');
    const published = await createPost({
      title: '[E2E] 공개+홈노출 글',
      content: '<p>내용</p>',
      mainImage: 'e2e-test.jpg',
      sourceUrl: undefined,
      isPinned: false,
      showOnHome: true,
      isPublished: true,
    });
    createdIds.push(published.id);

    const hidden = await createPost({
      title: '[E2E] 비공개 글',
      content: '<p>내용</p>',
      mainImage: 'e2e-test.jpg',
      sourceUrl: undefined,
      isPinned: false,
      showOnHome: true,
      isPublished: false,
    });
    createdIds.push(hidden.id);

    const notOnHome = await createPost({
      title: '[E2E] 공개+홈노출OFF 글',
      content: '<p>내용</p>',
      mainImage: 'e2e-test.jpg',
      sourceUrl: undefined,
      isPinned: false,
      showOnHome: false,
      isPublished: true,
    });
    createdIds.push(notOnHome.id);

    const publicList = await listPublishedPosts();
    const publicIds = publicList.map((p) => p.id);
    check('공개 글은 목록에 노출', publicIds.includes(published.id));
    check('비공개 글은 목록에서 제외', !publicIds.includes(hidden.id));

    const slides = await listSlides();
    const slideIds = slides.map((p) => p.id);
    check('홈노출 글은 슬라이드에 포함', slideIds.includes(published.id));
    check('비공개 글은 슬라이드에서 제외', !slideIds.includes(hidden.id));
    check('홈노출 OFF 글은 슬라이드에서 제외', !slideIds.includes(notOnHome.id));

    // ── 4. 슬라이드 API 응답 ────────────────────────
    console.log('\n[4] 슬라이드 API');
    const apiRes = await fetch(`${base}/api/story/slides`);
    const apiJson = (await apiRes.json()) as {
      slides: Array<{ id: number; title: string; imageUrl: string; href: string }>;
    };
    const target = apiJson.slides.find((s) => s.id === published.id);
    check('HTTP 200', apiRes.status === 200);
    check('imageUrl 경로 형식', target?.imageUrl === '/uploads/story/e2e-test.jpg', String(target?.imageUrl));
    check('href 경로 형식', target?.href === `/story/${published.id}`, String(target?.href));

    // ── 5. 상세 페이지 접근 ─────────────────────────
    console.log('\n[5] 상세 페이지');
    const detailOk = await fetch(`${base}/story/${published.id}`);
    check('공개 글 상세 → 200', detailOk.status === 200, `실제 ${detailOk.status}`);

    const detailHidden = await fetch(`${base}/story/${hidden.id}`);
    check('비공개 글 상세 → 404', detailHidden.status === 404, `실제 ${detailHidden.status}`);

    // ── 6. 정렬 규칙 ────────────────────────────────
    console.log('\n[6] 정렬 규칙');
    const pinned = await createPost({
      title: '[E2E] 고정 글',
      content: '<p>내용</p>',
      mainImage: 'e2e-test.jpg',
      sourceUrl: undefined,
      isPinned: true,
      showOnHome: false,
      isPublished: true,
    });
    createdIds.push(pinned.id);

    const sorted = await listPublishedPosts();
    check('고정 글이 맨 위', sorted[0]?.id === pinned.id, `1위 id=${sorted[0]?.id}`);
  } finally {
    // 테스트가 만든 데이터를 반드시 정리한다
    if (createdIds.length > 0) {
      await prisma.post.deleteMany({ where: { id: { in: createdIds } } });
      console.log(`\n(정리) 테스트 게시글 ${createdIds.length}건 삭제`);
    }
    await prisma.$disconnect();
    server.close();
  }

  console.log(`\n${failures === 0 ? '✅ 전체 통과' : `❌ ${failures}건 실패`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: `package.json`에 스크립트 추가**

`"test": "tsx scripts/e2e.ts",` 아래에 추가한다.
```json
    "test:story": "tsx scripts/e2e-story.ts",
```

- [ ] **Step 3: 테스트 실행**

Run: `npm run test:story`
Expected: `✅ 전체 통과`

- [ ] **Step 4: 기존 테스트가 깨지지 않았는지 확인**

Run: `npm test`
Expected: `✅ 전체 통과` (기존 24항목)

- [ ] **Step 5: `README.md` 갱신**

`### 스크립트` 표에 추가:
```
| `npm run test:story` | 게시판 e2e 검증 (실제 DB 사용, 테스트 데이터는 자동 정리) |
```

`## 라우트` 표에 추가:
```
| GET | `/story` | 이야기 목록 |
| GET | `/story/:id` | 이야기 상세 |
| GET | `/api/story/slides` | 홈 슬라이드용 JSON |
| GET/POST | `/admin/login` | 관리자 로그인 |
| GET | `/admin/story` | 게시글 관리 |
```

`## 환경변수` 표에 추가:
```
| `DATABASE_URL` | ✅ | 게시글 저장용 PostgreSQL (고객 접수 데이터는 저장하지 않음) |
| `ADMIN_PASSWORD_HASH` | ✅ | 관리자 비밀번호 bcrypt 해시 |
| `SESSION_SECRET` | ✅ | 세션 서명 키 (32자 이상) |
| `MAX_IMAGE_SIZE_MB` | | 업로드 이미지 최대 크기 (기본 5) |
```

`## 보안·운영 메모`에 추가:
```
- **게시판 XSS 방어**: Quill이 만든 본문 HTML은 상세 페이지에서 이스케이프 없이 출력되므로, 저장 시점에 서버에서 `sanitize-html`로 걸러냅니다([sanitize.service.ts](src/services/sanitize.service.ts)). 클라이언트 검증에 의존하지 않습니다.
- **게시판 이미지**: `public/uploads/story/`에 공개 서빙됩니다. 고객 접수 데이터와 달리 방문자에게 보여줘야 하는 콘텐츠이기 때문입니다. 파일명은 UUID로 재생성하고 MIME·확장자를 이중 검증합니다.
- **고아 이미지**: 글 삭제 시 대표 이미지만 함께 지웁니다. 본문에 삽입된 이미지는 남습니다(의도된 트레이드오프 — 스펙 참고).
```

`## 배포 전 체크리스트`에 추가:
```
- [ ] 배포 서버 `.env`에 `DATABASE_URL`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET` 설정
- [ ] 배포 서버에서 `npx prisma migrate deploy` 실행
- [ ] `public/uploads/story/` 디렉토리 쓰기 권한 확인
```

- [ ] **Step 6: 커밋**

```bash
git add scripts/e2e-story.ts package.json README.md
git commit -m "test: 게시판 e2e 검증 추가 및 문서 갱신"
```

---

### Task 11: 배포 반영

**Files:**
- Modify: 없음 (배포 작업만)

**Interfaces:**
- Consumes: 전체
- Produces: 없음

- [ ] **Step 1: 로컬 프로덕션 빌드 확인**

Run: `npm run build`
Expected: 성공, `dist/views/story/`와 `dist/views/admin/`에 EJS가 복사되어 있어야 한다

확인:
```bash
ls dist/views/story dist/views/admin
```
Expected: `list.ejs detail.ejs` / `login.ejs list.ejs form.ejs`

- [ ] **Step 2: 배포 서버에 환경변수 추가**

서버(`bytebard.cloud`)의 프로젝트 루트 `.env`에 다음 3개를 추가한다.
`DATABASE_URL`은 이미 있으므로 건드리지 않는다.

```bash
# 서버에서 실행
node -e "console.log('ADMIN_PASSWORD_HASH=' + require('bcrypt').hashSync('실제사용할비밀번호', 10))" >> .env
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env
echo "MAX_IMAGE_SIZE_MB=5" >> .env
```

- [ ] **Step 3: 서버에 배포**

```bash
# 서버에서 실행
git pull
npm ci
npx prisma migrate deploy
npm run deploy
```

- [ ] **Step 4: 배포 확인**

```bash
curl -s -o /dev/null -w "/story → %{http_code}\n" https://bytebard.cloud:8443/story
curl -s -o /dev/null -w "/admin/story (미로그인) → %{http_code}\n" https://bytebard.cloud:8443/admin/story
curl -s https://bytebard.cloud:8443/api/story/slides
```
Expected: `/story → 200`, `/admin/story → 302`, `{"slides":[]}`

- [ ] **Step 5: 관리자 페이지 실제 동작 확인**

브라우저에서 `https://bytebard.cloud:8443/admin/login` 접속 →
로그인 → 글 작성(대표 이미지 첨부 + 본문에 이미지 삽입) → 저장 →
`/story`에서 노출 확인 → "홈 슬라이드 노출" 켜고 홈에서 캐러셀 확인.

- [ ] **Step 6: 커밋 (변경 사항이 있는 경우에만)**

배포 과정에서 수정이 필요했다면 커밋한다. 없으면 이 단계는 건너뛴다.

---

## Self-Review 결과

**1. 스펙 커버리지**

| 스펙 요구사항 | 담당 태스크 |
| --- | --- |
| 이름 "이야기" / `/story` | Task 7 |
| 공개 목록·상세 | Task 7 |
| 슬라이드 API | Task 7 |
| 관리자 라우트 전체 | Task 8 |
| Post 모델 (showOnHome 포함) | Task 1 |
| 정렬 규칙 (`isPinned DESC, sortOrder ASC, createdAt DESC`) | Task 4 |
| sortOrder 재부여 후 스왑 | Task 4 (`movePost`) |
| 이미지 UUID 재생성 + MIME·확장자 이중 검증 | Task 6 |
| 대표 이미지 vs 본문 이미지 분리 | Task 8 |
| 삭제 시 대표 이미지만 정리 | Task 8 (`submitDelete`) |
| Quill 에디터 | Task 8 |
| 본문 sanitize | Task 3 |
| 캐러셀 (자동·순환·hover·touch·스와이프) | Task 9 |
| 단일 비밀번호 + 세션 | Task 5 |
| 로그인 rate limit | Task 5 |
| 신규 환경변수 4종 | Task 2 |
| 방문자 참여 없음 | (구현하지 않음 — 의도된 부재) |
| sitemap/robots | Task 7 |
| 테스트 범위 전항목 | Task 10 |

누락 없음.

**2. 플레이스홀더 스캔**

"TBD", "TODO", "적절히 처리" 같은 표현 없음. 모든 코드 단계에 실제 코드 포함.

**3. 타입 일관성 확인**

- `PostInput` (Task 3) → Task 4의 `createPost`/`updatePost` 시그니처와 일치
- `STORY_UPLOAD_DIR`, `toUploadError` (Task 6) → Task 8에서 동일한 이름으로 import
- `uploadMainImageSafe`/`uploadEditorImageSafe` (Task 6에서 정의) → Task 8 라우터에서 사용 — 일치
  - 초안에서는 래퍼가 Task 8에 흩어져 있었으나, 업로드 관련 로직을 `upload.ts` 한 곳에 모으고
    래핑되지 않은 원본은 export하지 않도록 Task 6으로 통합했다 (원본을 직접 쓰면 입력값이 날아감)
- `requireAdmin` (Task 5) → Task 8 라우터에서 사용 — 일치
- `req.uploadError` 타입 확장 (Task 8 Step 2) → 컨트롤러에서 참조 — 일치
- `listSlides`/`listPublishedPosts` (Task 4) → Task 7 컨트롤러, Task 10 테스트에서 사용 — 일치
