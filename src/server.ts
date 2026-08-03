import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`\n🚀 ${env.SITE_NAME} 서버가 실행되었습니다.`);
  console.log(`   http://localhost:${env.PORT}  (${env.NODE_ENV})\n`);
});

/** 컨테이너/PM2 환경에서 진행 중인 요청을 마무리하고 안전하게 종료 */
const shutdown = (signal: string) => {
  console.log(`\n${signal} 수신 — 서버를 종료합니다.`);
  server.close(() => process.exit(0));
  // 10초 안에 닫히지 않으면 강제 종료
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
