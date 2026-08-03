import type { ErrorRequestHandler, RequestHandler } from 'express';
import { env } from '../config/env';
import { notifyServerError } from '../services/alert.service';

/** 매칭되는 라우트가 없을 때 */
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).render('error', {
    pageTitle: '페이지를 찾을 수 없습니다',
    pageDescription: '요청하신 페이지가 존재하지 않습니다.',
    statusCode: 404,
    heading: '페이지를 찾을 수 없습니다',
    message: '주소가 변경되었거나 삭제된 페이지입니다.\n아래 버튼으로 홈으로 이동해주세요.',
    showContact: false,
  });
};

/**
 * 글로벌 에러 핸들러.
 * 스택 트레이스는 서버 로그에만 남기고 사용자에게는 노출하지 않는다.
 */
export const globalErrorHandler: ErrorRequestHandler = (error, req, res, next) => {
  // 응답이 이미 시작됐다면 Express 기본 핸들러에 위임
  if (res.headersSent) {
    next(error);
    return;
  }

  console.error(`[error] ${req.method} ${req.originalUrl}`, error);

  // 운영 채널로 알림 (실패해도 응답에는 영향을 주지 않도록 fire-and-forget)
  void notifyServerError({ method: req.method, path: req.path, error });

  res.status(500).render('error', {
    pageTitle: '일시적인 오류가 발생했습니다',
    pageDescription: '서버에 일시적인 문제가 발생했습니다.',
    statusCode: 500,
    heading: '일시적인 오류가 발생했습니다',
    message: env.isProduction
      ? '잠시 후 다시 시도해주세요.\n계속 문제가 발생하면 아래 연락처로 알려주시면 바로 도와드리겠습니다.'
      : `개발 모드 상세: ${error instanceof Error ? error.message : String(error)}`,
    showContact: true,
  });
};

/** async 컨트롤러의 rejection을 글로벌 에러 핸들러로 넘겨주는 래퍼 */
export const asyncHandler =
  (handler: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
