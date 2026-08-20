import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { globalErrorHandler, notFoundHandler } from './middlewares/errorHandler';
import { router } from './routes';

/** 정적 파일 루트 (개발: src/../public, 빌드: dist/../public 모두 프로젝트 루트를 가리킨다) */
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const OG_IMAGE_PATH = '/images/og-image.png';

/**
 * og:image는 파일이 실제로 있을 때만 내보낸다.
 * 없는 이미지를 가리키면 카카오톡·SNS 공유 시 깨진 미리보기가 뜨는데,
 * 아예 태그가 없으면 플랫폼이 제목·설명만으로 깔끔하게 렌더링한다.
 */
const hasOgImage = fs.existsSync(path.join(PUBLIC_DIR, 'images', 'og-image.png'));

if (!hasOgImage) {
  console.warn(
    `⚠️  public${OG_IMAGE_PATH} 가 없어 og:image 태그를 생략합니다.\n` +
      '   1200×630 이미지를 넣으면 카카오톡 공유 미리보기에 썸네일이 표시됩니다.',
  );
}

export function createApp(): express.Express {
  const app = express();

  // nginx 등 리버스 프록시 뒤에서 클라이언트 IP를 정확히 인식 (rate-limit 정확도에 필요)
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // 뷰 엔진 — 개발(src/views), 빌드(dist/views) 모두 __dirname 기준으로 동작
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  // 모든 뷰가 의존하는 공통 locals. 반드시 다른 모든 미들웨어보다 먼저 등록한다.
  // express.urlencoded의 body 크기 제한(413) 등 이후 미들웨어가 에러를 던지면
  // Express는 이 아래에 등록된 일반 미들웨어를 전부 건너뛰고 에러 핸들러로 바로 간다.
  // 그 상태로 error.ejs(→head.ejs)가 canonicalUrl/ogImage를 참조하면 두 번째 예외가 나서
  // 커스텀 에러 페이지 자체가 깨지고 Express 기본 에러 페이지(스택 노출)로 새 버린다.
  // req.path는 라우팅 전에도 이미 존재하므로 맨 앞에 두어도 안전하다.
  app.use((req, res, next) => {
    res.locals.currentPath = req.path;
    res.locals.pageTitle = env.SITE_NAME;
    res.locals.pageDescription = `${env.AGENT_NAME} 설계사가 여러 보험사 상품을 비교해 꼭 필요한 보장만 설계해드립니다.`;
    res.locals.canonicalUrl = `${env.SITE_ORIGIN}${req.path}`;
    res.locals.ogImage = hasOgImage ? `${env.SITE_ORIGIN}${OG_IMAGE_PATH}` : null;
    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // Tailwind Play CDN(cdn.tailwindcss.com)은 브라우저에서 CSS를 즉석 컴파일하므로
          // 스크립트 소스 허용과 'unsafe-eval'이 필요하다.
          // 빌드 타임 Tailwind(CLI/PostCSS)로 전환하면 아래 두 항목을 제거할 수 있다.
          scriptSrc: ["'self'", 'https://cdn.tailwindcss.com', 'https://cdn.jsdelivr.net', "'unsafe-eval'"],
          // Tailwind CDN이 <style> 태그를 런타임에 주입하므로 인라인 스타일 허용이 필요하고,
          // Pretendard 웹폰트를 jsDelivr CDN의 <link rel="stylesheet">로 불러오므로 그 출처도 허용한다.
          styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
          imgSrc: ["'self'", 'data:'],
          // Pretendard 폰트 파일(.woff2 등)도 같은 jsDelivr CDN에서 서빙된다.
          fontSrc: ["'self'", 'data:', 'https://cdn.jsdelivr.net'],
          connectSrc: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          // 개발 환경(http://localhost)에서는 https 강제 업그레이드를 끈다.
          ...(env.isProduction ? {} : { upgradeInsecureRequests: null }),
        },
      },
      // 카카오톡/SNS 공유 미리보기 크롤러가 og:image를 읽을 수 있도록 완화
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // HTTPS는 아직 이 앱 앞단에 없다(README: "HTTPS 종단은 프록시에서 처리").
      // helmet 기본값은 HSTS를 항상 켜는데, HTTP로만 서비스 중인 상태에서 이 헤더를 보내면
      // 브라우저가 해당 도메인(+ includeSubDomains)을 최대 1년간 강제로 https:// 로만
      // 접속하도록 캐싱해버려, TLS가 없는 포트로는 ERR_SSL_PROTOCOL_ERROR가 뜨고
      // 서버를 고쳐도 이미 캐싱된 브라우저 정책 때문에 복구되지 않는다.
      // 실제로 프록시가 TLS를 종단하게 되면 그쪽에서 HSTS를 설정할 것.
      hsts: false,
    }),
  );

  app.use(morgan(env.isProduction ? 'combined' : 'dev'));

  // 관리자 세션. 메모리 저장소를 쓰므로 재시작 시 로그아웃되지만,
  // 관리자 1인이 가끔 쓰는 용도라 세션 DB까지는 두지 않는다.
  app.use(
    session({
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        // 프로덕션은 nginx가 TLS를 종단하므로 secure 쿠키를 쓸 수 있다
        secure: env.isProduction,
        maxAge: 1000 * 60 * 60 * 12, // 12시간
      },
    }),
  );

  // 폼 전송 전용 — JSON 본문은 사용하지 않으며, 과도한 페이로드를 차단한다.
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));

  app.use(
    express.static(PUBLIC_DIR, {
      maxAge: env.isProduction ? '7d' : 0,
    }),
  );

  // 모든 뷰에서 공통으로 쓰는 값 (연락처 플로팅 버튼, footer, SEO 등)
  app.locals.siteName = env.SITE_NAME;
  app.locals.siteOrigin = env.SITE_ORIGIN;
  app.locals.agentName = env.AGENT_NAME;
  app.locals.agentEmail = env.AGENT_EMAIL ?? '';
  app.locals.contactPhone = env.CONTACT_PHONE;
  app.locals.contactPhoneHref = env.CONTACT_PHONE_HREF;
  app.locals.kakaoUrl = env.KAKAO_OPEN_PROFILE_URL;

  app.use(router);

  app.use(notFoundHandler);
  app.use(globalErrorHandler);

  return app;
}
