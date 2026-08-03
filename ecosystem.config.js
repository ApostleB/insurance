/**
 * PM2 배포 설정
 *
 * 사용법:
 *   npm run build          # dist/ 생성 (EJS 뷰까지 복사됨)
 *   npm run pm2:start      # 기동
 *   npm run pm2:logs       # 로그 확인
 *   npx pm2 save           # 현재 프로세스 목록 저장 (재부팅 후 복구용)
 *   npx pm2 startup        # 부팅 시 자동 시작 등록 (출력되는 명령을 sudo로 실행)
 *
 * 주의: `.env`는 저장소에 포함되지 않습니다. 배포 서버의 프로젝트 루트에
 *       `.env`를 직접 두어야 하며, dotenv가 cwd 기준으로 읽습니다.
 */
module.exports = {
  apps: [
    {
      name: 'insurance-site',
      script: 'dist/server.js',
      cwd: __dirname,

      // 인스턴스를 늘리면 express-rate-limit의 인메모리 카운터가 프로세스마다 따로 잡혀
      // IP당 제한(15분 5회)이 인스턴스 수만큼 느슨해집니다.
      // 설계사 1인 사이트 트래픽에는 1개로 충분하며, 늘려야 한다면 Redis 등 공유 저장소를 먼저 붙이세요.
      instances: 1,
      exec_mode: 'fork',

      autorestart: true,
      max_restarts: 10,
      min_uptime: '20s',
      max_memory_restart: '300M',
      watch: false,

      // dotenv는 이미 존재하는 환경변수를 덮어쓰지 않으므로, 여기서 지정한 production이 유지됩니다.
      // PORT 등 나머지 값은 서버의 .env 파일이 담당합니다.
      env: {
        NODE_ENV: 'production',
      },

      // server.ts의 graceful shutdown이 최대 10초까지 기다리므로 그보다 길게 잡습니다.
      // (PM2 기본값 1600ms로는 처리 중인 요청이 SIGKILL로 잘립니다)
      kill_timeout: 11000,
      listen_timeout: 8000,

      out_file: 'logs/out.log',
      error_file: 'logs/error.log',
      merge_logs: true,
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],

  // ── 원격 서버 자동 배포 (선택) ────────────────────────────────
  // 아래 값을 실제 서버 정보로 채운 뒤:
  //   npx pm2 deploy production setup     # 최초 1회
  //   npx pm2 deploy production           # 이후 배포
  //
  // setup 직후, 서버의 <path>/current 에 `.env` 파일을 직접 올려두어야 합니다.
  //
  // deploy: {
  //   production: {
  //     user: 'deploy',
  //     host: ['your-server.example.com'],
  //     ref: 'origin/main',
  //     repo: 'git@github.com:USER/REPO.git',
  //     path: '/home/deploy/insurance-site',
  //     'post-deploy':
  //       'npm ci && npm run build && pm2 startOrReload ecosystem.config.js --update-env && pm2 save',
  //   },
  // },
};
