import type { Request, RequestHandler, Response } from 'express';
import { env } from '../config/env';
import { toFieldErrors, type FieldErrors } from '../schemas/common';
import { claimSchema, consultationSchema } from '../schemas/inquiry.schema';
import { forwardInquiry } from '../services/inquiry.service';

type FormView = 'consultation' | 'claim';

const FORM_META: Record<FormView, { pageTitle: string; pageDescription: string; completePath: string }> = {
  consultation: {
    pageTitle: `설계신청 | ${env.SITE_NAME}`,
    pageDescription:
      '이름과 연락처, 궁금한 내용만 남겨주시면 여러 보험사 상품을 비교해 맞춤 설계를 안내드립니다.',
    completePath: '/consultation/complete',
  },
  claim: {
    pageTitle: `청구신청 | ${env.SITE_NAME}`,
    pageDescription:
      '보험금 청구, 어렵지 않습니다. 이름과 연락처, 사고 내용만 남겨주시면 설계사가 직접 연락드려 서류를 안내합니다.',
    completePath: '/claim/complete',
  },
};

/** 웹훅 전송 실패 시 사용자에게 보여줄 안내 (유일한 전달 경로이므로 반드시 알린다) */
const DELIVERY_FAILED_MESSAGE =
  '일시적인 오류로 신청 접수에 실패했습니다. 번거로우시겠지만 아래 전화 또는 카카오톡으로 연락 주시면 바로 도와드리겠습니다.';

/** 폼에 다시 채워 넣을 값 (동의 체크 여부는 boolean) */
interface FormValues {
  name: string;
  phone: string;
  details: string;
  privacyConsent: boolean;
}

const EMPTY_VALUES: FormValues = { name: '', phone: '', details: '', privacyConsent: false };

/** 폼 재렌더링 시 사용자가 입력했던 값을 유지하기 위해 추출 */
const pickValues = (body: Request['body']): FormValues => ({
  name: typeof body?.name === 'string' ? body.name : '',
  phone: typeof body?.phone === 'string' ? body.phone : '',
  details: typeof body?.details === 'string' ? body.details : '',
  privacyConsent: body?.privacyConsent === 'on' || body?.privacyConsent === 'true',
});

interface RenderFormOptions {
  status?: number;
  errors?: FieldErrors;
  values?: FormValues;
  formError?: string | null;
}

const renderForm = (res: Response, view: FormView, options: RenderFormOptions = {}): void => {
  const meta = FORM_META[view];
  res.status(options.status ?? 200).render(view, {
    pageTitle: meta.pageTitle,
    pageDescription: meta.pageDescription,
    errors: options.errors ?? {},
    values: options.values ?? EMPTY_VALUES,
    formError: options.formError ?? null,
  });
};

/** 허니팟 필드가 채워졌다면 봇으로 간주 */
const isBot = (body: Request['body']): boolean =>
  typeof body?.website === 'string' && body.website.trim() !== '';

// ── 설계신청 ────────────────────────────────────────────────

export const renderConsultationForm: RequestHandler = (_req, res) => {
  renderForm(res, 'consultation');
};

export const submitConsultation: RequestHandler = async (req, res) => {
  // 봇은 전송 없이 성공한 것처럼 응답한다 (스팸 재시도 유도 방지)
  if (isBot(req.body)) {
    res.redirect(FORM_META.consultation.completePath);
    return;
  }

  const parsed = consultationSchema.safeParse(req.body);
  if (!parsed.success) {
    renderForm(res, 'consultation', {
      status: 400,
      errors: toFieldErrors(parsed.error),
      values: pickValues(req.body),
    });
    return;
  }

  try {
    await forwardInquiry('consultation', parsed.data);
  } catch (error) {
    console.error('[consultation] Discord 전달 실패 — 접수가 유실되었습니다.', error);
    renderForm(res, 'consultation', {
      status: 502,
      values: pickValues(req.body),
      formError: DELIVERY_FAILED_MESSAGE,
    });
    return;
  }

  res.redirect(FORM_META.consultation.completePath);
};

export const renderConsultationComplete: RequestHandler = (_req, res) => {
  res.render('complete', {
    pageTitle: `설계신청 완료 | ${env.SITE_NAME}`,
    pageDescription: '설계신청이 정상적으로 접수되었습니다.',
    heading: '설계신청이 접수되었습니다',
    message: '남겨주신 연락처로 설계사가 직접 연락드리겠습니다.\n영업일 기준 당일, 늦어도 다음 날 안에 연락드립니다.',
    notice: null,
  });
};

// ── 청구신청 ────────────────────────────────────────────────

export const renderClaimForm: RequestHandler = (_req, res) => {
  renderForm(res, 'claim');
};

export const submitClaim: RequestHandler = async (req, res) => {
  if (isBot(req.body)) {
    res.redirect(FORM_META.claim.completePath);
    return;
  }

  const parsed = claimSchema.safeParse(req.body);
  if (!parsed.success) {
    renderForm(res, 'claim', {
      status: 400,
      errors: toFieldErrors(parsed.error),
      values: pickValues(req.body),
    });
    return;
  }

  try {
    await forwardInquiry('claim', parsed.data);
  } catch (error) {
    console.error('[claim] Discord 전달 실패 — 접수가 유실되었습니다.', error);
    renderForm(res, 'claim', {
      status: 502,
      values: pickValues(req.body),
      formError: DELIVERY_FAILED_MESSAGE,
    });
    return;
  }

  res.redirect(FORM_META.claim.completePath);
};

export const renderClaimComplete: RequestHandler = (_req, res) => {
  res.render('complete', {
    pageTitle: `청구신청 완료 | ${env.SITE_NAME}`,
    pageDescription: '청구신청이 정상적으로 접수되었습니다.',
    heading: '청구신청이 접수되었습니다',
    message: '남겨주신 연락처로 설계사가 직접 연락드리겠습니다.',
    notice: '영수증·진단서 등 필요한 서류는 통화하면서 하나씩 안내해드리니, 지금 준비하지 않으셔도 됩니다.',
  });
};
