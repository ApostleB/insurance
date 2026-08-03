import type { RequestHandler } from 'express';
import { env } from '../config/env';

/** 취급 보험사 목록 — 실제 취급사에 맞게 수정해서 사용하세요. */
export const PARTNER_INSURERS = [
  { name: '삼성생명', category: '생명보험' },
  { name: '한화생명', category: '생명보험' },
  { name: '교보생명', category: '생명보험' },
  { name: '신한라이프', category: '생명보험' },
  { name: '삼성화재', category: '손해보험' },
  { name: 'DB손해보험', category: '손해보험' },
  { name: '현대해상', category: '손해보험' },
  { name: 'KB손해보험', category: '손해보험' },
  { name: '메리츠화재', category: '손해보험' },
  { name: '흥국화재', category: '손해보험' },
] as const;

/** 메인 페이지에 노출할 강점 카드 */
const STRENGTHS = [
  {
    icon: '🤝',
    title: '한 곳에 얽매이지 않습니다',
    body: '여러 보험사 상품을 함께 비교해, 고객님 상황에 가장 잘 맞는 설계를 제안드립니다.',
  },
  {
    icon: '📄',
    title: '가입보다 유지가 중요합니다',
    body: '보장 분석부터 청구까지, 가입 이후에도 끝까지 함께 챙겨드립니다.',
  },
  {
    icon: '⚡',
    title: '빠른 응대',
    body: '신청 주시면 영업일 기준 당일, 늦어도 다음 날 안에 직접 연락드립니다.',
  },
] as const;

export const renderHome: RequestHandler = (_req, res) => {
  res.render('index', {
    pageTitle: `${env.SITE_NAME} | 여러 보험사를 한 번에 비교하는 독립 보험설계사`,
    pageDescription: `${env.AGENT_NAME} 설계사가 여러 보험사 상품을 비교해 꼭 필요한 보장만 설계해드립니다. 보험금 청구도 함께 도와드립니다.`,
    insurers: PARTNER_INSURERS,
    strengths: STRENGTHS,
  });
};

export const renderPrivacy: RequestHandler = (_req, res) => {
  res.render('privacy', {
    pageTitle: `개인정보처리방침 | ${env.SITE_NAME}`,
    pageDescription: '개인정보 수집 항목, 이용 목적, 보유 기간 및 파기 절차를 안내합니다.',
  });
};

/** 헬스체크 — DB를 사용하지 않으므로 프로세스 상태만 확인한다. */
export const healthCheck: RequestHandler = (_req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
};
