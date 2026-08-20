/**
 * "이야기" 게시판 e2e 검증 — `npm run test:story`
 *
 * 실제 원격 DB(bytebard.cloud:15432)에 연결해 테스트 게시글을 만들고, 끝나면 지운다.
 * Discord 웹훅은 이 기능과 무관하므로 건드리지 않는다 — 더미 URL은 env 검증 통과용이다.
 * 외부 테스트 프레임워크 없이 tsx로 바로 실행한다 (scripts/e2e.ts와 같은 스타일).
 */

const APP_PORT = 39992;

// env.ts는 import 시점에 검증하므로, app을 불러오기 전에 덮어써야 한다.
process.env.PORT = String(APP_PORT);
process.env.NODE_ENV = 'development';
process.env.DISCORD_WEBHOOK_GENERAL = 'http://127.0.0.1:1/hook';
process.env.DISCORD_WEBHOOK_CONSULTATION = 'http://127.0.0.1:1/hook';
process.env.DISCORD_WEBHOOK_CLAIM = 'http://127.0.0.1:1/hook';
// DATABASE_URL / ADMIN_PASSWORD_HASH / SESSION_SECRET는 덮어쓰지 않는다 —
// 이 테스트는 실제 게시판 DB와 실제 관리자 비밀번호로 로그인까지 검증해야 한다.

// 운영 비밀번호를 바꾸면 이 스크립트가 깨지므로 환경변수로 덮어쓸 수 있게 한다.
//   E2E_ADMIN_PASSWORD=실제비밀번호 npm run test:story
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'changeme1234';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

const base = `http://127.0.0.1:${APP_PORT}`;

/** 로그인 응답의 Set-Cookie를 다음 요청에 그대로 실어 보낼 "name=value" 문자열로 합친다. */
const collectCookie = (res: Response): string =>
  res.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');

async function main() {
  const { createApp } = await import('../src/app');
  const { prisma } = await import('../src/lib/prisma');
  const { sanitizePostContent } = await import('../src/services/sanitize.service');
  const { postSchema } = await import('../src/schemas/post.schema');
  const { createPost, listAllPosts, listPublishedPosts, listSlides, movePost } = await import(
    '../src/services/post.service'
  );
  const { STORY_UPLOAD_DIR } = await import('../src/middlewares/upload');
  const fs = await import('node:fs/promises');

  // movePost는 성공 시 DB의 "모든" 글의 sortOrder를 다시 매긴다([8]에서 검증).
  // 실제 운영 글이 있는 상태로 이 스크립트를 돌리면 기존 노출 순서가 뒤섞이므로,
  // 게시판이 비어 있을 때만 실행하도록 방어한다.
  const existingCount = await prisma.post.count();
  console.log(`\n[사전 점검] 실행 전 posts: ${existingCount}건`);
  if (existingCount > 0) {
    console.error(
      `\n❌ posts 테이블에 이미 글이 있어 중단합니다. 이 스크립트는 movePost 검증 중 전체 글의 노출 순서를 재배열하므로, 게시판이 비어 있을 때만 실행해주세요.\n`,
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  const server = createApp().listen(APP_PORT);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));

  const createdIds: number[] = [];

  try {
    // ── 1. 관리자 접근 제어 및 로그인 ────────────────
    console.log('\n[1] 관리자 접근 제어 및 로그인');
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

    const goodLogin = await fetch(`${base}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ password: ADMIN_PASSWORD }).toString(),
      redirect: 'manual',
    });
    check('올바른 비밀번호 → 302 리다이렉트', goodLogin.status === 302, `실제 ${goodLogin.status}`);
    check('게시글 관리 페이지로 이동', goodLogin.headers.get('location') === '/admin/story');

    const adminCookie = collectCookie(goodLogin);
    check('세션 쿠키 발급', adminCookie.length > 0);

    const authedList = await fetch(`${base}/admin/story`, { headers: { Cookie: adminCookie } });
    check('발급받은 쿠키로 관리자 목록 접근 → 200', authedList.status === 200, `실제 ${authedList.status}`);

    // ── 2. 본문 sanitize ──────────────────────────────
    console.log('\n[2] 본문 sanitize');
    const dirty = '<p>정상 문단</p><script>alert(1)</script><img src="x" onerror="alert(1)">';
    const clean = sanitizePostContent(dirty);
    check('script 태그 제거', !clean.includes('<script'));
    check('onerror 속성 제거', !clean.includes('onerror'));
    check('정상 문단은 유지', clean.includes('정상 문단'));

    // ── 3. sourceUrl 스킴 차단 (회귀) ─────────────────
    // zod의 .url()은 javascript:/data:/vbscript: 스킴도 유효한 URL로 통과시킨다.
    // 이 값은 상세 페이지 "원문 보기" 링크의 href에 그대로 들어가므로, postSchema의
    // http(s) 한정 refine이 빠지면 클릭 시 스크립트가 실행되는 XSS 경로가 된다.
    console.log('\n[3] sourceUrl 스킴 차단 (회귀)');
    const baseFields = {
      title: '스킴 테스트',
      content: '<p>내용</p>',
      isPinned: false,
      showOnHome: false,
      isPublished: true,
    };
    const rejectedSchemes = [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
    ];
    for (const scheme of rejectedSchemes) {
      const result = postSchema.safeParse({ ...baseFields, sourceUrl: scheme });
      check(`sourceUrl 거부: ${scheme}`, !result.success);
    }
    const allowedScheme = postSchema.safeParse({ ...baseFields, sourceUrl: 'https://example.com' });
    check('sourceUrl 허용: https://example.com', allowedScheme.success);

    // ── 4. 공개 노출 규칙 ──────────────────────────────
    console.log('\n[4] 공개 노출 규칙');
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

    // ── 5. 슬라이드 API ────────────────────────────────
    console.log('\n[5] 슬라이드 API');
    const apiRes = await fetch(`${base}/api/story/slides`);
    const apiJson = (await apiRes.json()) as {
      slides: Array<{ id: number; title: string; imageUrl: string; href: string }>;
    };
    const target = apiJson.slides.find((s) => s.id === published.id);
    check('HTTP 200', apiRes.status === 200);
    check('imageUrl 경로 형식', target?.imageUrl === '/uploads/story/e2e-test.jpg', String(target?.imageUrl));
    check('href 경로 형식', target?.href === `/story/${published.id}`, String(target?.href));

    // ── 6. 상세 페이지 ─────────────────────────────────
    console.log('\n[6] 상세 페이지');
    const detailOk = await fetch(`${base}/story/${published.id}`);
    check('공개 글 상세 → 200', detailOk.status === 200, `실제 ${detailOk.status}`);

    const detailHidden = await fetch(`${base}/story/${hidden.id}`);
    check('비공개 글 상세 → 404', detailHidden.status === 404, `실제 ${detailHidden.status}`);

    // 회귀: Int4(2147483647) 상한을 넘는 id는 Prisma 에러(500)가 아니라 404여야 한다.
    const overMax = await fetch(`${base}/story/2147483648`);
    check('Int4 상한 초과 id → 404 (회귀)', overMax.status === 404, `실제 ${overMax.status}`);

    // ── 7. 정렬 규칙 ───────────────────────────────────
    console.log('\n[7] 정렬 규칙');
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

    // ── 8. movePost 그룹 경계 (회귀) ────────────────────
    // 8-a: 고정글 ↔ 일반글 경계를 넘는 이동은 무동작이어야 한다.
    // 8-b: 같은 그룹(고정-고정, 일반-일반) 안에서의 이동은 정상 동작해야 한다.
    console.log('\n[8] movePost 그룹 경계 (회귀)');
    const pinnedA = await createPost({
      title: '[E2E] 고정 A',
      content: '<p>내용</p>',
      mainImage: 'e2e-test.jpg',
      sourceUrl: undefined,
      isPinned: true,
      showOnHome: false,
      isPublished: true,
    });
    createdIds.push(pinnedA.id);

    const pinnedB = await createPost({
      title: '[E2E] 고정 B',
      content: '<p>내용</p>',
      mainImage: 'e2e-test.jpg',
      sourceUrl: undefined,
      isPinned: true,
      showOnHome: false,
      isPublished: true,
    });
    createdIds.push(pinnedB.id);

    const normalB = await createPost({
      title: '[E2E] 일반 B',
      content: '<p>내용</p>',
      mainImage: 'e2e-test.jpg',
      sourceUrl: undefined,
      isPinned: false,
      showOnHome: false,
      isPublished: true,
    });
    createdIds.push(normalB.id);

    // 8-a. 관리자 목록(listAllPosts)에서 방금 만든 일반 글(normalB)은 새 글이라
    // 일반 그룹의 맨 위에 있고, 그 바로 위는 고정 그룹의 마지막 글이어야 한다.
    const beforeBoundary = await listAllPosts();
    const normalBIdx = beforeBoundary.findIndex((p) => p.id === normalB.id);
    const upNeighbor = beforeBoundary[normalBIdx - 1];
    check(
      '사전 조건: 일반 글 바로 위는 고정 글',
      upNeighbor?.isPinned === true,
      `이웃 id=${upNeighbor?.id}, isPinned=${upNeighbor?.isPinned}`,
    );

    // 화면 순서(index)로는 이 가드를 검증할 수 없다.
    // 정렬이 isPinned를 최우선으로 보므로, 경계에서 sortOrder를 맞바꿔도
    // 각 그룹 내부의 상대 순서는 원래 안 바뀌어 index는 가드 유무와 무관하게 동일하다.
    // 가드가 실제로 막는 것은 "전체 글의 sortOrder를 재기록하는 불필요한 쓰기"이므로
    // DB의 raw sortOrder가 그대로인지를 본다.
    const sortOrdersBefore = beforeBoundary.map((p) => `${p.id}:${p.sortOrder}`).join(',');
    await movePost(normalB.id, 'up');
    const afterBoundary = await listAllPosts();
    const normalBIdxAfter = afterBoundary.findIndex((p) => p.id === normalB.id);
    const sortOrdersAfter = afterBoundary.map((p) => `${p.id}:${p.sortOrder}`).join(',');
    check(
      '고정↔일반 경계를 넘는 이동은 화면 순서를 바꾸지 않음',
      normalBIdxAfter === normalBIdx,
      `이동 전 ${normalBIdx}위 → 이동 후 ${normalBIdxAfter}위`,
    );
    check(
      '고정↔일반 경계를 넘는 이동은 DB를 건드리지 않음 (회귀)',
      sortOrdersAfter === sortOrdersBefore,
      sortOrdersAfter === sortOrdersBefore ? 'sortOrder 전부 그대로' : `변경됨: ${sortOrdersBefore} → ${sortOrdersAfter}`,
    );

    // 8-b. 고정 그룹 안에서는 이동이 정상 동작해야 한다.
    // pinnedB가 pinnedA보다 나중에 만들어졌으므로 목록에서 pinnedB가 바로 위에 있다.
    const beforeSwap = await listAllPosts();
    const bIdx = beforeSwap.findIndex((p) => p.id === pinnedB.id);
    const aIdx = beforeSwap.findIndex((p) => p.id === pinnedA.id);
    check('사전 조건: 고정 B가 고정 A 바로 위', bIdx === aIdx - 1, `B=${bIdx}위, A=${aIdx}위`);

    await movePost(pinnedB.id, 'down');
    const afterSwap = await listAllPosts();
    const bIdxAfter = afterSwap.findIndex((p) => p.id === pinnedB.id);
    const aIdxAfter = afterSwap.findIndex((p) => p.id === pinnedA.id);
    check(
      '같은 그룹(고정) 내 이동은 정상 동작 — A가 B보다 위로',
      aIdxAfter === bIdxAfter - 1,
      `A=${aIdxAfter}위, B=${bIdxAfter}위`,
    );

    // ── 9. 검증 실패 시 본문 sanitize 반사 방지 (회귀) ──
    // 저장 경로(post.service.createPost)만 sanitize하고, 검증 실패 후 폼을
    // 다시 그리는 경로(adminStory.controller.pickValues)를 놓쳤던 저장형 XSS.
    // 제목 없이(검증 실패 유도) + 본문에 script를 넣어도 400 응답에 그대로
    // 반사되면 안 된다.
    console.log('\n[9] 검증 실패 시 본문 sanitize 반사 방지 (회귀)');
    const xssForm = new FormData();
    xssForm.append('content', '<p>정상 문단</p><script>alert(1)</script>');
    // title 필드는 의도적으로 첨부하지 않는다.

    const xssRes = await fetch(`${base}/admin/story`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: xssForm,
    });
    const xssHtml = await xssRes.text();
    check('제목 누락 → 400', xssRes.status === 400, `실제 ${xssRes.status}`);
    check('제목 에러 메시지 노출', xssHtml.includes('제목을 입력해주세요'));
    check('script 페이로드가 재렌더링 화면에 반사되지 않음', !xssHtml.includes('alert(1)'));
    check('정상 문단은 유지됨', xssHtml.includes('정상 문단'));

    // ── 10. 본문 없이 저장 (자격증 사진처럼 이미지 한 장만 올리는 경우) ──
    console.log('\n[10] 본문 없이 저장');
    const emptyContentCases: Array<[string, unknown]> = [
      ['본문 필드 자체가 없음', undefined],
      ['빈 문자열', ''],
      ['공백만', '   '],
    ];
    for (const [label, content] of emptyContentCases) {
      const parsed = postSchema.safeParse({
        title: '본문 없는 글',
        isPinned: false,
        showOnHome: false,
        isPublished: true,
        ...(content === undefined ? {} : { content }),
      });
      check(
        `본문 미입력 허용 — ${label}`,
        parsed.success,
        parsed.success ? '' : JSON.stringify(parsed.error.flatten().fieldErrors.content),
      );
      // 컬럼이 NOT NULL이므로 null/undefined가 아니라 빈 문자열로 정규화되어야 한다
      check(
        `본문 미입력 시 빈 문자열로 정규화 — ${label}`,
        parsed.success && parsed.data.content === '',
        parsed.success ? `실제 ${JSON.stringify(parsed.data.content)}` : '파싱 실패',
      );
    }

    // 스키마만이 아니라 DB 저장 → 상세 페이지 렌더까지 실제로 통과하는지 확인한다
    const noContent = await createPost({
      title: '[E2E] 본문 없는 글',
      content: '',
      mainImage: 'e2e-test.jpg',
      sourceUrl: undefined,
      isPinned: false,
      showOnHome: false,
      isPublished: true,
    });
    createdIds.push(noContent.id);
    check('본문 없는 글이 DB에 저장됨', noContent.content === '', `실제 ${JSON.stringify(noContent.content)}`);

    const noContentRes = await fetch(`${base}/story/${noContent.id}`);
    const noContentHtml = await noContentRes.text();
    check('본문 없는 글 상세 → 200', noContentRes.status === 200, `실제 ${noContentRes.status}`);
    check('제목은 정상 노출', noContentHtml.includes('[E2E] 본문 없는 글'));
    check('빈 본문 div는 렌더링하지 않음', !noContentHtml.includes('class="story-content'));
  } finally {
    // 테스트가 만든 데이터를 반드시 정리한다
    if (createdIds.length > 0) {
      await prisma.post.deleteMany({ where: { id: { in: createdIds } } });
      console.log(`\n(정리) 테스트 게시글 ${createdIds.length}건 삭제`);
    }

    // 이 스크립트는 실제 파일 업로드([9]에서도 이미지 파일을 첨부하지 않는다)를
    // 발생시키지 않아야 한다. 고아 파일이 남지 않았는지 확인한다.
    const remainingUploads = await fs.readdir(STORY_UPLOAD_DIR).catch(() => [] as string[]);
    check('업로드 디렉토리에 남은 파일 없음', remainingUploads.length === 0, `${remainingUploads.length}개 남음`);

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
