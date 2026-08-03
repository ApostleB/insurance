import { z, ZodError } from 'zod';

/** 한국 휴대폰 번호 (010-1234-5678 / 01012345678 모두 허용) */
export const KR_MOBILE_REGEX = /^01[016789]-?\d{3,4}-?\d{4}$/;

/**
 * 개인정보 수집·이용 동의 체크박스용 스키마.
 * HTML 체크박스는 체크 시 'on'을 전송하고, 미체크 시 아예 전송되지 않는다.
 */
export const requiredConsent = z
  .preprocess(
    (value) => value === 'on' || value === 'true' || value === true,
    z.boolean(),
  )
  .refine((value) => value === true, {
    message: '개인정보 수집 및 이용에 동의해주셔야 신청이 가능합니다.',
  });

/** 봇 차단용 허니팟 필드 — 사람에게는 보이지 않으므로 항상 비어 있어야 한다. */
export const honeypot = z.string().optional();

/** 전화번호를 010-1234-5678 형태로 정규화 */
export const normalizePhone = (phone: string): string => {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone;
};

/** 필드별 에러 메시지 맵 — 폼 재렌더링 시 입력창 바로 아래에 표시하기 위해 사용 */
export type FieldErrors = Record<string, string>;

export const toFieldErrors = (error: ZodError): FieldErrors => {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_form';
    // 같은 필드에 여러 에러가 있으면 첫 번째 메시지만 노출
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
};
