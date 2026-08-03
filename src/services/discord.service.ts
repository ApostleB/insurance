import { env } from '../config/env';

/** 알림 종류별 웹훅 대상 */
export type WebhookTarget = 'general' | 'consultation' | 'claim';

const WEBHOOK_URLS: Record<WebhookTarget, string> = {
  general: env.DISCORD_WEBHOOK_GENERAL,
  consultation: env.DISCORD_WEBHOOK_CONSULTATION,
  claim: env.DISCORD_WEBHOOK_CLAIM,
};

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  /** 10진수 색상값 (예: 0x2563eb) */
  color?: number;
  url?: string;
  fields?: DiscordEmbedField[];
  footer?: { text: string };
  timestamp?: string;
}

export interface SendOptions {
  target: WebhookTarget;
  embeds: DiscordEmbed[];
  content?: string;
}

/** Discord Embed 필드 값은 1024자 제한 — 초과분은 잘라낸다. */
const FIELD_VALUE_LIMIT = 1024;

/**
 * Embed description은 4096자까지 허용된다.
 * 길이가 긴 고객 입력(상세내용)은 field가 아니라 이쪽에 담아야 잘리지 않는다.
 */
export const DESCRIPTION_LIMIT = 4096;

const truncate = (value: string, limit = FIELD_VALUE_LIMIT): string =>
  value.length > limit ? `${value.slice(0, limit - 3)}...` : value;

/** description에 담을 긴 본문을 한도에 맞춰 정리한다. */
export const describe = (value: string): string => truncate(value, DESCRIPTION_LIMIT);

/** 빈 값도 Discord가 거부하지 않도록 '-'로 치환하고 길이를 제한한다. */
export const field = (
  name: string,
  value?: string | number | null,
  inline = false,
): DiscordEmbedField => ({
  name,
  value: truncate(value === undefined || value === null || value === '' ? '-' : String(value)),
  inline,
});

/**
 * 응답을 기다리는 최대 시간.
 * 사용자가 제출 버튼을 누른 채 대기하는 시간이므로 짧게 잡는다.
 */
const REQUEST_TIMEOUT_MS = 8_000;

/** 서버가 명시적으로 처리를 거부한 상태 코드 — 이 경우에만 재시도한다. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Discord 웹훅 전송 (Embed 포맷).
 * 실패 시 예외를 던지므로, 호출부에서는 sendDiscordNotificationSafely 사용을 권장한다.
 *
 * 재시도 정책:
 * - 5xx/429처럼 **서버가 처리를 거부한 것이 확실한 경우에만** 1회 재시도한다.
 * - 타임아웃·네트워크 오류는 메시지가 이미 전달됐을 수 있어 재시도하지 않는다.
 *   (중복 알림보다 실패를 사용자에게 알려 전화·카톡으로 유도하는 편이 안전하다)
 */
export async function sendDiscordNotification({
  target,
  embeds,
  content,
}: SendOptions): Promise<void> {
  const payload: Record<string, unknown> = {
    username: env.SITE_NAME,
    embeds,
    // 멘션 인젝션 방지 (@everyone/@here 무력화)
    allowed_mentions: { parse: [] },
  };
  if (content) payload.content = truncate(content, 2000);

  const body = JSON.stringify(payload);
  const url = WEBHOOK_URLS[target];
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.ok) return;

    const responseText = await response.text().catch(() => '');

    if (attempt < maxAttempts && RETRYABLE_STATUS.has(response.status)) {
      console.warn(`[discord] ${response.status} 응답 — 재시도합니다. (${attempt}/${maxAttempts})`);
      await sleep(retryDelayMs(response, responseText));
      continue;
    }

    throw new Error(`Discord 웹훅 전송 실패 (${response.status}): ${responseText.slice(0, 300)}`);
  }
}

/** 429일 때 Discord가 알려주는 retry_after(초)를 존중하되, 사용자 대기시간을 고려해 상한을 둔다. */
function retryDelayMs(response: Response, responseText: string): number {
  if (response.status !== 429) return 500;
  try {
    const retryAfter = (JSON.parse(responseText) as { retry_after?: number }).retry_after;
    if (typeof retryAfter === 'number') return Math.min(retryAfter * 1000, 2_000);
  } catch {
    // 본문이 JSON이 아니면 기본값을 쓴다
  }
  return 1_000;
}

/**
 * 전송 실패를 호출부로 전파하지 않아야 하는 곳(운영 알림 등)에서 사용하는 헬퍼.
 *
 * 주의: 고객 접수(consultation/claim)에는 쓰지 않는다.
 *       DB가 없어 웹훅이 유일한 전달 경로이므로, 접수 실패는 사용자에게 반드시 알려야 한다.
 */
export async function sendDiscordNotificationSafely(options: SendOptions): Promise<boolean> {
  try {
    await sendDiscordNotification(options);
    return true;
  } catch (error) {
    console.error(`[discord] '${options.target}' 알림 전송에 실패했습니다.`, error);
    return false;
  }
}
