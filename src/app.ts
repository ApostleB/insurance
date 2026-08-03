import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { globalErrorHandler, notFoundHandler } from './middlewares/errorHandler';
import { router } from './routes';

export function createApp(): express.Express {
  const app = express();

  // nginx 등 리버스 프록시 뒤에서 클라이언트 IP를 정확히 인식 (rate-limit 정확도에 필요)
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // 뷰 엔진 — 개발(src/views), 빌드(dist/views) 모두 __dirname 기준으로 동작
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // Tailwind Play CDN(cdn.tailwindcss.com)은 브라우저에서 CSS를 즉석 컴파일하므로
          // 스크립트 소스 허용과 'unsafe-eval'이 필요하다.
          // 빌드 타임 Tailwind(CLI/PostCSS)로 전환하면 아래 두 항목을 제거할 수 있다.
          scriptSrc: ["'self'", 'https://cdn.tailwindcss.com', "'unsafe-eval'"],
          // Tailwind CDN이 <style> 태그를 런타임에 주입하므로 인라인 스타일 허용이 필요하다.
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'", 'data:'],
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
    }),
  );

  app.use(morgan(env.isProduction ? 'combined' : 'dev'));

  // 폼 전송 전용 — JSON 본문은 사용하지 않으며, 과도한 페이로드를 차단한다.
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));

  app.use(
    express.static(path.join(__dirname, '..', 'public'), {
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

  // 페이지별로 덮어쓸 수 있는 기본값
  app.use((req, res, next) => {
    res.locals.currentPath = req.path;
    res.locals.pageTitle = env.SITE_NAME;
    res.locals.pageDescription = `${env.AGENT_NAME} 설계사가 여러 보험사 상품을 비교해 꼭 필요한 보장만 설계해드립니다.`;
    res.locals.canonicalUrl = `${env.SITE_ORIGIN}${req.path}`;
    res.locals.ogImage = `${env.SITE_ORIGIN}/images/og-image.png`;
    next();
  });

  app.use(router);

  app.use(notFoundHandler);
  app.use(globalErrorHandler);

  return app;
}
