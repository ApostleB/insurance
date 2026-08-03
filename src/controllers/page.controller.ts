import type { RequestHandler } from 'express';
import { env } from '../config/env';

export const renderHome: RequestHandler = (_req, res) => {
  res.render('index', {
    pageTitle: `${env.SITE_NAME} | 여러 보험사를 한 번에 비교하는 독립 보험설계사`,
    pageDescription: `${env.AGENT_NAME} 설계사가 여러 보험사 상품을 비교해 꼭 필요한 보장만 설계해드립니다. 보험금 청구도 함께 도와드립니다.`,
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
