import { z } from 'zod';
import { KR_MOBILE_REGEX, honeypot, requiredConsent } from './common';

/**
 * 설계신청 / 청구신청 공통 입력 필드.
 * 수집 항목은 **이름 / 연락처 / 상세내용** 세 가지로 한정한다.
 * (개인정보 수집 동의 체크박스는 법적 요건이므로 별도 유지)
 */
const baseFields = {
  name: z
    .string({ required_error: '이름을 입력해주세요.' })
    .trim()
    .min(2, '이름은 2자 이상 입력해주세요.')
    .max(20, '이름은 20자 이하로 입력해주세요.'),

  phone: z
    .string({ required_error: '연락처를 입력해주세요.' })
    .trim()
    .regex(KR_MOBILE_REGEX, '휴대폰 번호 형식이 올바르지 않습니다. (예: 010-1234-5678)'),

  privacyConsent: requiredConsent,

  /** 허니팟 — 사람이 채우지 않는 숨김 필드 */
  website: honeypot,
};

export const consultationSchema = z.object({
  ...baseFields,
  details: z
    .string({ required_error: '상담받고 싶은 내용을 입력해주세요.' })
    .trim()
    .min(5, '상담 내용을 5자 이상 입력해주세요.')
    .max(2000, '상담 내용은 2000자 이하로 입력해주세요.'),
});

export const claimSchema = z.object({
  ...baseFields,
  details: z
    .string({ required_error: '사고 내용을 입력해주세요.' })
    .trim()
    .min(10, '어떤 일이 있었는지 10자 이상 자세히 적어주세요.')
    .max(2000, '사고 내용은 2000자 이하로 입력해주세요.'),
});

/** req.body 타입은 별도 인터페이스 없이 zod 스키마에서 추론한다. */
export type ConsultationInput = z.infer<typeof consultationSchema>;
export type ClaimInput = z.infer<typeof claimSchema>;
export type InquiryInput = ConsultationInput | ClaimInput;
