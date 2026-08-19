import bcrypt from 'bcrypt';
import type { RequestHandler } from 'express';
import { env } from '../config/env';

export const renderLogin: RequestHandler = (_req, res) => {
  res.render('admin/login', {
    pageTitle: `관리자 로그인 | ${env.SITE_NAME}`,
    pageDescription: '관리자 전용 페이지입니다.',
    error: null,
  });
};

/**
 * 로그인 처리.
 *
 * 주의: Express 4는 async 핸들러의 rejection을 에러 미들웨어로 자동 전달하지 않는다.
 * 라우터에 연결할 때 반드시 `asyncHandler()`로 감쌀 것 — 감싸지 않으면
 * bcrypt.compare가 reject될 경우 요청이 응답 없이 멈추고 프로세스가 죽을 수 있다.
 */
export const submitLogin: RequestHandler = async (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const isValid = password !== '' && (await bcrypt.compare(password, env.ADMIN_PASSWORD_HASH));

  if (!isValid) {
    res.status(401).render('admin/login', {
      pageTitle: `관리자 로그인 | ${env.SITE_NAME}`,
      pageDescription: '관리자 전용 페이지입니다.',
      error: '비밀번호가 올바르지 않습니다.',
    });
    return;
  }

  // 세션 고정 공격 방지 — 로그인 성공 시 세션 ID를 새로 발급한다
  req.session.regenerate((err) => {
    if (err) {
      console.error('[admin] 세션 재생성 실패', err);
      res.status(500).render('admin/login', {
        pageTitle: `관리자 로그인 | ${env.SITE_NAME}`,
        pageDescription: '관리자 전용 페이지입니다.',
        error: '로그인 처리 중 오류가 발생했습니다. 다시 시도해주세요.',
      });
      return;
    }
    req.session.isAdmin = true;
    res.redirect('/admin/story');
  });
};

export const logout: RequestHandler = (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
};
