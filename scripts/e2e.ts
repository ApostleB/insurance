/**
 * 접수 전 과정 e2e 검증 — `npm test`
 *
 * 로컬 스텁 웹훅을 띄워 검증하므로 **실제 Discord로는 아무것도 전송되지 않는다.**
 * 외부 테스트 프레임워크 없이 tsx로 바로 실행한다.
 */
import http from 'node:http';

const STUB_PORT = 39990;
const APP_PORT = 39991;

// env.ts는 import 시점에 검증하므로, app을 불러오기 전에 덮어써야 한다.
process.env.PORT = String(APP_PORT);
process.env.NODE_ENV = 'development';
process.env.DISCORD_WEBHOOK_GENERAL = `http://127.0.0.1:${STUB_PORT}/hook`;
process.env.DISCORD_WEBHOOK_CONSULTATION = `http://127.0.0.1:${STUB_PORT}/hook`;
// 청구는 항상 500을 돌려주는 경로에 붙여 실패 UX와 재시도를 확인한다.
process.env.DISCORD_WEBHOOK_CLAIM = `http://127.0.0.1:${STUB_PORT}/fail`;

// 이 테스트는 접수 흐름만 검증하므로 DB나 관리자 기능을 쓰지 않는다.
// 다만 env.ts가 기동 시점에 모든 필수 변수를 검증하므로, .env가 없는 환경(CI, 새 클론)에서도
// 돌아가도록 게시판용 변수에 더미 값을 넣어준다. 실제로 접속하지 않는다.
process.env.DATABASE_URL ??= 'postgresql://unused:unused@127.0.0.1:1/unused?schema=public';
process.env.ADMIN_PASSWORD_HASH ??= '$2b$10$0000000000000000000000000000000000000000000000000000';
process.env.SESSION_SECRET ??= 'e2e-dummy-session-secret-not-used-in-this-test';

// 사이트 메타·연락처도 뷰 렌더링에만 쓰이므로 더미로 채워 .env 의존을 없앤다.
process.env.CONTACT_PHONE ??= '010-0000-0000';
process.env.KAKAO_OPEN_PROFILE_URL ??= 'https://open.kakao.com/o/e2e-dummy';
process.env.SITE_URL ??= 'http://127.0.0.1';
process.env.SITE_NAME ??= 'e2e 테스트';

interface DiscordEmbedPayload {
  title?: string;
  description?: string;
  fields?: Array<{ name: string; value: string }>;
  footer?: { text: string };
}

interface CapturedRequest {
  path: string;
  payload: { embeds?: DiscordEmbedPayload[]; allowed_mentions?: unknown };
}

const captured: CapturedRequest[] = [];
let failHits = 0;

const stub = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (chunk) => chunks.push(chunk as Buffer));
  req.on('end', () => {
    if (req.url === '/fail') {
      failHits += 1;
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('stub: intentional failure');
      return;
    }
    captured.push({
      path: req.url ?? '',
      payload: JSON.parse(Buffer.concat(chunks).toString('utf8')),
    });
    res.writeHead(204);
    res.end();
  });
});

const post = (path: string, data: Record<string, string>) =>
  fetch(`http://127.0.0.1:${APP_PORT}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(data).toString(),
    redirect: 'manual',
  });

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

async function main() {
  await new Promise<void>((resolve) => stub.listen(STUB_PORT, '127.0.0.1', resolve));

  const { createApp } = await import('../src/app');
  const server = createApp().listen(APP_PORT);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));

  // ── 1. 설계신청 정상 접수 ────────────────────────────
  console.log('\n[1] 설계신청 정상 접수');
  const ok = await post('/consultation', {
    name: '김보험',
    phone: '01012345678',
    details: '실손보험만 있는데 암보험을 추가하고 싶습니다. 보험료는 월 5만원 이내로요.',
    privacyConsent: 'on',
  });
  check('HTTP 302', ok.status === 302, `실제 ${ok.status}`);
  check('완료 페이지로 리다이렉트', ok.headers.get('location') === '/consultation/complete');

  const embed = captured[0]?.payload?.embeds?.[0];
  const fields = embed?.fields ?? [];
  const valueOf = (name: string) => fields.find((f) => f.name === name)?.value;

  check('웹훅 1건 전송', captured.length === 1, `${captured.length}건`);
  check(
    '멘션 인젝션 차단(allowed_mentions)',
    JSON.stringify(captured[0]?.payload?.allowed_mentions) === '{"parse":[]}',
  );
  check('필드는 이름/연락처 2개', fields.length === 2, fields.map((f) => f.name).join(', '));
  check('이름 그대로 전달', valueOf('이름') === '김보험', String(valueOf('이름')));
  check('전화번호 정규화 + 마스킹 없음', valueOf('연락처') === '010-1234-5678', String(valueOf('연락처')));
  check('상세내용은 description에 담김', (embed?.description ?? '').includes('암보험'));
  check('동의 사실이 footer에 기록', String(embed?.footer?.text ?? '').includes('동의 완료'));

  // ── 2. 긴 상세내용이 잘리지 않는지 ───────────────────
  // Embed field 한도는 1024자, description은 4096자.
  // 입력 상한(2000자)이 field 한도를 넘으므로 description에 담아야 유실되지 않는다.
  console.log('\n[2] 긴 상세내용(1800자) 유실 여부');
  const longText = '가'.repeat(1800);
  const long = await post('/consultation', {
    name: '박길다',
    phone: '010-1111-2222',
    details: longText,
    privacyConsent: 'on',
  });
  const longEmbed = captured[1]?.payload?.embeds?.[0];
  check('HTTP 302', long.status === 302, `실제 ${long.status}`);
  check('1800자 전량 전달됨', (longEmbed?.description ?? '').includes(longText), `길이 ${longEmbed?.description?.length ?? 0}`);
  check('잘림 표시(...) 없음', !(longEmbed?.description ?? '').endsWith('...'));

  // ── 3. 웹훅 실패 시 사용자 안내 ──────────────────────
  console.log('\n[3] 웹훅이 500을 반환할 때');
  const fail = await post('/claim', {
    name: '이청구',
    phone: '010-9876-5432',
    details: '지난주 계단에서 넘어져 발목이 골절됐습니다. 4주 진단 받았습니다.',
    privacyConsent: 'on',
  });
  const html = await fail.text();
  check('HTTP 502', fail.status === 502, `실제 ${fail.status}`);
  check('5xx에 1회 재시도', failHits === 2, `웹훅 호출 ${failHits}회`);
  check('실패 안내 문구 노출', html.includes('신청 접수에 실패했습니다'));
  check('전화·카톡 대체 안내 노출', html.includes('바로 전화하기') && html.includes('카카오톡 상담'));
  check('입력값 유지', html.includes('이청구') && html.includes('010-9876-5432'));

  // ── 4. 검증 실패 / 허니팟 ────────────────────────────
  console.log('\n[4] 검증 실패와 허니팟');
  const invalid = await post('/claim', {
    name: '김',
    phone: '123',
    details: '짧음',
    privacyConsent: 'on',
  });
  const invalidHtml = await invalid.text();
  check('HTTP 400', invalid.status === 400, `실제 ${invalid.status}`);
  check('이름 에러 표시', invalidHtml.includes('이름은 2자 이상'));
  check('전화번호 에러 표시', invalidHtml.includes('휴대폰 번호 형식이'));
  check('상세내용 에러 표시', invalidHtml.includes('10자 이상'));

  const sentBefore = captured.length;
  const bot = await post('/consultation', {
    name: '봇',
    phone: '010-0000-0000',
    details: '스팸 스팸 스팸 스팸',
    privacyConsent: 'on',
    website: 'http://spam.example.com',
  });
  check('허니팟 → 성공한 척 302', bot.status === 302);
  check('허니팟 → 웹훅 전송 없음', captured.length === sentBefore, `${captured.length - sentBefore}건 추가됨`);

  server.close();
  stub.close();
  console.log(`\n${failures === 0 ? '✅ 전체 통과' : `❌ ${failures}건 실패`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
