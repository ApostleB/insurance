import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/**
 * 서버 기동 시 필수 환경변수를 검증한다.
 * 누락/형식 오류가 있으면 어떤 키가 왜 잘못됐는지 출력하고 프로세스를 종료한다.
 *
 * 참고: 이 서비스는 DB를 사용하지 않으므로 DATABASE_URL이 없다.
 *       접수 내용은 Discord 웹훅으로만 전달된다.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DISCORD_WEBHOOK_GENERAL: z.string().url('올바른 Discord 웹훅 URL이 아닙니다.'),
  DISCORD_WEBHOOK_CONSULTATION: z.string().url('올바른 Discord 웹훅 URL이 아닙니다.'),
  DISCORD_WEBHOOK_CLAIM: z.string().url('올바른 Discord 웹훅 URL이 아닙니다.'),

  CONTACT_PHONE: z
    .string()
    .regex(/^0\d{1,2}-?\d{3,4}-?\d{4}$/, 'CONTACT_PHONE 형식이 올바르지 않습니다. (예: 010-1234-5678)'),
  KAKAO_OPEN_PROFILE_URL: z.string().url('올바른 카카오 오픈프로필 URL이 아닙니다.'),

  SITE_URL: z.string().url('SITE_URL은 http(s)를 포함한 전체 URL이어야 합니다.'),
  SITE_NAME: z.string().min(1),

  // 뷰/개인정보처리방침 렌더링용 (선택)
  // 뒤에 '설계사'가 붙어 렌더링되므로 이름만 넣는다. (예: 홍길동 → "홍길동 설계사가")
  AGENT_NAME: z.string().min(1).default('OOO'),
  AGENT_EMAIL: z.string().email().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('\n❌ 환경변수 설정 오류 — .env 파일을 확인해주세요.\n');
  for (const issue of parsed.error.issues) {
    console.error(`  • ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error('\n👉 .env.example 을 복사해서 .env 를 만든 뒤 값을 채워주세요.\n');
  process.exit(1);
}

const raw = parsed.data;

// 형식은 맞지만 실서비스에 부적절한 값은 조용히 넘어가면 나중에 발견하기 어렵다.
// SITE_URL이 잘못되면 canonical·og:url·sitemap이 전부 엉뚱한 도메인을 가리킨다.
if (raw.NODE_ENV === 'production' && /(example\.com|localhost)/.test(raw.SITE_URL)) {
  console.warn(
    `\n⚠️  SITE_URL이 아직 '${raw.SITE_URL}' 입니다.\n` +
      '   canonical, og:url, sitemap.xml이 모두 이 주소로 생성되어 검색 노출과 카톡 공유 미리보기가 깨집니다.\n' +
      '   .env의 SITE_URL을 실제 도메인으로 바꿔주세요.\n',
  );
}

export const env = {
  ...raw,
  /** tel: 링크용으로 숫자만 남긴 전화번호 */
  CONTACT_PHONE_HREF: `tel:${raw.CONTACT_PHONE.replace(/[^0-9+]/g, '')}`,
  /** SITE_URL 끝의 슬래시 제거 (canonical/sitemap 조합용) */
  SITE_ORIGIN: raw.SITE_URL.replace(/\/+$/, ''),
  isProduction: raw.NODE_ENV === 'production',
  isDevelopment: raw.NODE_ENV === 'development',
} as const;

export type Env = typeof env;
