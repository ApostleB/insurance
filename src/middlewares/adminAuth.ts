import type { RequestHandler } from 'express';

// express-session의 SessionData에 관리자 플래그를 추가한다.
declare module 'express-session' {
  interface SessionData {
    isAdmin?: boolean;
  }
}

/** 관리자 로그인 여부 확인 — 미로그인 시 로그인 페이지로 보낸다. */
export const requireAdmin: RequestHandler = (req, res, next) => {
  if (req.session.isAdmin) {
    next();
    return;
  }
  res.redirect('/admin/login');
};
