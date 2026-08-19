import rateLimit from 'express-rate-limit';

/**
 * 신청 폼 제출 제한 — IP당 15분에 5회.
 * 초과 시 딱딱한 JSON 대신, 전화/카카오톡으로 바로 연결되는 에러 페이지를 보여준다.
 */
export const formSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).render('error', {
      pageTitle: '잠시 후 다시 시도해주세요',
      pageDescription: '요청이 너무 많습니다.',
      statusCode: 429,
      heading: '요청이 너무 많습니다',
      message:
        '스팸 방지를 위해 15분에 5회까지만 신청할 수 있습니다.\n급하신 경우 아래 전화 또는 카카오톡으로 바로 연락 주세요.',
      showContact: true,
    });
  },
});

/**
 * 관리자 로그인 시도 제한 — IP당 15분에 10회.
 * 단일 비밀번호 구조라 무차별 대입에 취약하므로 반드시 필요하다.
 */
export const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).render('error', {
      pageTitle: '잠시 후 다시 시도해주세요',
      pageDescription: '로그인 시도가 너무 많습니다.',
      statusCode: 429,
      heading: '로그인 시도가 너무 많습니다',
      message: '보안을 위해 15분간 로그인이 제한됩니다.\n잠시 후 다시 시도해주세요.',
      showContact: false,
    });
  },
});
