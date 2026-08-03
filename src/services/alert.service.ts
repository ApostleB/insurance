import { env } from '../config/env';
import { field, sendDiscordNotificationSafely } from './discord.service';

/**
 * 운영 알림 (DISCORD_WEBHOOK_GENERAL).
 *
 * 관리자 페이지가 없으므로 서버 상태를 알 수 있는 창구는 Discord뿐이다.
 * 고객 접수 알림(consultation/claim)과 채널을 분리해 운영 이슈만 이쪽으로 보낸다.
 *
 * 주의: 알림 본문에 고객 개인정보를 넣지 않는다.
 *       요청 경로는 쿼리스트링이 없는 `req.path`만 사용한다.
 */

/** 같은 에러가 반복될 때 채널이 도배되지 않도록 하는 쿨다운 */
const ALERT_COOLDOWN_MS = 60_000;
/** Discord 필드 값 1024자 제한을 넘지 않도록 스택을 미리 자른다 (코드블록 표시 여유분 포함) */
const STACK_CHAR_LIMIT = 900;

let lastAlertAt = 0;
let suppressedCount = 0;

export interface ServerErrorContext {
  method: string;
  /** 쿼리스트링이 제외된 경로 (req.path) */
  path: string;
  error: unknown;
}

export async function notifyServerError({ method, path, error }: ServerErrorContext): Promise<void> {
  // 개발 중에는 콘솔 로그로 충분하므로 채널을 어지럽히지 않는다.
  if (!env.isProduction) return;

  const now = Date.now();
  if (now - lastAlertAt < ALERT_COOLDOWN_MS) {
    suppressedCount += 1;
    return;
  }

  const skipped = suppressedCount;
  lastAlertAt = now;
  suppressedCount = 0;

  const message = error instanceof Error ? error.message : String(error);
  const stack =
    error instanceof Error && error.stack
      ? error.stack.split('\n').slice(0, 6).join('\n').slice(0, STACK_CHAR_LIMIT)
      : '스택 정보 없음';

  await sendDiscordNotificationSafely({
    target: 'general',
    embeds: [
      {
        title: '🚨 서버 오류가 발생했습니다',
        color: 0xdc2626, // red-600
        fields: [
          field('요청', `${method} ${path}`),
          field('메시지', message),
          field('스택 (상위 6줄)', `\`\`\`\n${stack}\n\`\`\``),
          ...(skipped > 0 ? [field('참고', `직전 1분간 동일 알림 ${skipped}건은 생략되었습니다.`)] : []),
        ],
        footer: { text: `${env.SITE_NAME} · ${env.NODE_ENV}` },
        timestamp: new Date().toISOString(),
      },
    ],
  });
}
