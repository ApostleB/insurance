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
