import { env } from '../config/env';
import { normalizePhone } from '../schemas/common';
import type { InquiryInput } from '../schemas/inquiry.schema';
import { describe, field, sendDiscordNotification, type WebhookTarget } from './discord.service';

export type InquiryKind = 'consultation' | 'claim';

interface KindMeta {
  target: WebhookTarget;
  title: string;
  color: number;
  detailsLabel: string;
}

const KIND_META: Record<InquiryKind, KindMeta> = {
  consultation: {
    target: 'consultation',
    title: '📝 새로운 설계신청이 접수되었습니다',
    color: 0x2563eb, // blue-600
    detailsLabel: '상담 요청 내용',
  },
  claim: {
    target: 'claim',
    title: '🧾 새로운 청구신청이 접수되었습니다',
    color: 0xd97706, // amber-600
    detailsLabel: '사고 내용',
  },
};

/**
 * 접수 내용을 Discord로 전달한다.
 *
 * DB를 사용하지 않으므로 이 전송이 **유일한 전달 경로**다.
 * 따라서 실패를 삼키지 않고 예외를 그대로 던져 컨트롤러가 사용자에게 안내하도록 한다.
 *
 * 전달 항목은 이름 / 연락처 / 상세내용 세 가지로 한정한다.
 * (전화번호는 바로 회신할 수 있도록 마스킹하지 않는다)
 *
 * 상세내용은 최대 2000자까지 입력받는데 Embed field 한도는 1024자다.
 * field에 넣으면 뒷부분이 잘리고 DB가 없어 복구할 방법이 없으므로,
 * 4096자까지 허용되는 description에 담는다.
 */
export async function forwardInquiry(kind: InquiryKind, input: InquiryInput): Promise<void> {
  const meta = KIND_META[kind];
  const phone = normalizePhone(input.phone);

  await sendDiscordNotification({
    target: meta.target,
    embeds: [
      {
        title: meta.title,
        color: meta.color,
        description: describe(`**${meta.detailsLabel}**\n${input.details}`),
        fields: [field('이름', input.name, true), field('연락처', phone, true)],
        footer: { text: `${env.SITE_NAME} · 개인정보 수집·이용 동의 완료` },
        timestamp: new Date().toISOString(),
      },
    ],
  });
}
