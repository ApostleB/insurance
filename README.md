# 독립 보험설계사 홈페이지

모바일 퍼스트(Mobile-First) 보험 상담·청구 접수 사이트입니다.
**데이터베이스를 사용하지 않으며**, 신청 내용은 Discord 웹훅으로 담당 설계사에게 즉시 전달됩니다.

## 기술 스택

| 구분 | 사용 기술 |
| --- | --- |
| Runtime | Node.js 20+ (TypeScript) |
| Framework | Express 4 |
| Template | EJS |
| CSS | Tailwind CSS (Play CDN) |
| Validation | zod (`z.infer`로 `req.body` 타입 추론) |
| 보안 | helmet, express-rate-limit, honeypot |
| 로깅 | morgan |
| 알림 | Discord Webhook (native fetch) |

> DB / ORM / 파일 업로드는 의도적으로 사용하지 않습니다.
> 영수증·진단서 등 서류는 접수 후 설계사가 직접 연락하여 안내합니다.

## 시작하기

```bash
npm install
cp .env.example .env   # 값을 채운 뒤
npm run dev            # http://localhost:3000
```

### 스크립트

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | tsx watch 개발 서버 |
| `npm run build` | TypeScript 컴파일 + EJS 뷰 복사 (`dist/`) |
| `npm start` | 빌드 결과 실행 |
| `npm run typecheck` | 타입 검사만 수행 |
| `npm test` | 접수 전 과정 e2e 검증 (로컬 스텁 웹훅 사용 — 실제 Discord로 전송되지 않음) |
| `npm run deploy` | 빌드 후 PM2로 기동/무중단 리로드 |
| `npm run pm2:logs` | PM2 로그 확인 |

## 배포 (PM2)

`ecosystem.config.js` 하나로 관리합니다.

```bash
npm ci
npm run deploy        # build + pm2 startOrReload
npx pm2 save          # 현재 프로세스 목록 저장
npx pm2 startup       # 부팅 시 자동 시작 등록 (출력되는 명령을 sudo로 실행)
```

이후 코드가 바뀌면 `npm run deploy` 한 번이면 됩니다 (`startOrReload`라 최초 기동/재배포 모두 처리).

**서버에 반드시 직접 올려야 하는 것**

- `.env` — 저장소에 포함되지 않습니다. 프로젝트 루트에 두면 dotenv가 cwd 기준으로 읽습니다.
- `public/images/og-image.png` — 없어도 동작하지만 공유 미리보기가 비어 보입니다.

**설정 시 의도한 값들**

| 항목 | 값 | 이유 |
| --- | --- | --- |
| `instances` / `exec_mode` | `1` / `fork` | rate-limit이 인메모리라 인스턴스를 늘리면 IP당 제한이 그만큼 느슨해집니다. 늘리려면 Redis 등 공유 저장소를 먼저 붙이세요. |
| `kill_timeout` | `11000` | `server.ts`의 graceful shutdown이 최대 10초 대기합니다. PM2 기본값 1600ms로는 처리 중인 요청이 SIGKILL로 잘립니다. |
| `env.NODE_ENV` | `production` | dotenv는 기존 환경변수를 덮어쓰지 않으므로, `.env`에 `NODE_ENV=development`가 남아 있어도 production이 유지됩니다. |

production으로 기동되면 `DISCORD_WEBHOOK_GENERAL` 채널로 **서버 시작 알림이 1건 전송**됩니다.

원격 서버 자동 배포(`pm2 deploy`)를 쓰려면 `ecosystem.config.js` 하단의 `deploy` 블록 주석을 풀고 host/repo/path를 채우세요.

리버스 프록시(nginx 등) 뒤에 두는 것을 전제로 `trust proxy = 1`이 설정되어 있습니다. HTTPS 종단은 프록시에서 처리하세요.

## 환경변수

`.env.example` 참고. 서버 기동 시 `src/config/env.ts`에서 zod로 검증하며,
누락·형식 오류가 있으면 어떤 키가 왜 잘못됐는지 출력하고 종료합니다.

| 키 | 필수 | 설명 |
| --- | :---: | --- |
| `NODE_ENV` | | `development` \| `production` (기본 development) |
| `PORT` | | 기본 3000 |
| `DISCORD_WEBHOOK_GENERAL` | ✅ | 운영 알림 (500 에러 / 서버 기동) — production에서만 전송 |
| `DISCORD_WEBHOOK_CONSULTATION` | ✅ | 설계신청 알림 |
| `DISCORD_WEBHOOK_CLAIM` | ✅ | 청구신청 알림 |
| `CONTACT_PHONE` | ✅ | `tel:` 링크에 사용 |
| `KAKAO_OPEN_PROFILE_URL` | ✅ | 카카오 오픈채팅 링크 |
| `SITE_URL` | ✅ | canonical / og:url / sitemap 생성 |
| `SITE_NAME` | ✅ | 사이트명 (헤더·푸터·Discord username) |
| `AGENT_NAME` | | 설계사 이름 **(이름만 입력 — 뒤에 '설계사'가 자동으로 붙음)** |
| `AGENT_EMAIL` | | 개인정보 보호책임자 이메일 (없으면 노출 안 됨) |

## 디렉토리 구조

```
src/
├── app.ts                    # Express 앱 조립 (helmet/CSP, 정적파일, locals)
├── server.ts                 # 서버 기동 + graceful shutdown
├── config/env.ts             # 환경변수 zod 검증
├── schemas/
│   ├── common.ts             # 휴대폰 정규식, 동의 체크박스, 에러 맵 변환
│   └── inquiry.schema.ts     # 설계/청구 폼 스키마 (이름·연락처·상세내용)
├── services/
│   ├── discord.service.ts    # 웹훅 전송 모듈 (Embed)
│   ├── inquiry.service.ts    # 접수 내용 → Discord Embed 변환·전달
│   └── alert.service.ts      # 운영 알림 (500 에러·서버 기동) → GENERAL 웹훅
├── controllers/
│   ├── page.controller.ts    # 메인/개인정보처리방침/헬스체크
│   ├── inquiry.controller.ts # 설계·청구 폼 렌더 및 제출 처리
│   └── seo.controller.ts     # sitemap.xml / robots.txt
├── middlewares/
│   ├── rateLimiter.ts        # POST 폼 제출 제한 (15분 5회)
│   └── errorHandler.ts       # 404 / 500 / asyncHandler
├── routes/index.ts
└── views/                    # EJS (partials + 페이지)
public/                       # 정적 리소스 (favicon, js)
```

## 라우트

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/` | 본인소개 (프로필·강점·취급 보험사) |
| GET | `/consultation` | 설계신청 폼 |
| POST | `/consultation` | 검증 → Discord 전송 → 완료 페이지 |
| GET | `/consultation/complete` | 설계신청 완료 |
| GET | `/claim` | 청구신청 폼 (파일 첨부 없음) |
| POST | `/claim` | 검증 → Discord 전송 → 완료 페이지 |
| GET | `/claim/complete` | 청구신청 완료 |
| GET | `/privacy` | 개인정보처리방침 |
| GET | `/sitemap.xml`, `/robots.txt` | SEO |
| GET | `/health` | 헬스체크 |

## Discord 알림 3종

| 웹훅 | 언제 울리는가 | 담기는 내용 |
| --- | --- | --- |
| `CONSULTATION` | 설계신청 접수 성공 | 이름·연락처(field) + 상담 내용(description) — 마스킹 없음 |
| `CLAIM` | 청구신청 접수 성공 | 이름·연락처(field) + 사고 내용(description) — 마스킹 없음 |
| `GENERAL` | 500 에러 발생 / 서버 기동 **(production만)** | 요청 경로·에러 메시지·스택 상위 6줄 — **고객 정보는 넣지 않음** |

운영 알림은 같은 에러가 반복될 때 채널이 도배되지 않도록 60초 쿨다운이 걸려 있으며,
생략된 건수는 다음 알림에 함께 표기됩니다.

**상세내용을 field가 아닌 description에 담는 이유**: 입력 상한은 2000자인데 Discord Embed의 field value 한도는 1024자입니다.
field에 넣으면 긴 상담 내용의 뒷부분이 잘리고, DB가 없어 복구할 방법이 없습니다.
description은 4096자까지 허용되므로 유실 없이 전달됩니다. (`npm test`의 [2]번 항목이 이걸 검증합니다)

**전송 실패 처리**: 응답 대기는 8초까지이며, 5xx/429처럼 서버가 명시적으로 거부한 경우에만 1회 재시도합니다.
타임아웃·네트워크 오류는 이미 전달됐을 수 있어 재시도하지 않고, 사용자에게 실패를 알려 전화·카톡으로 유도합니다.

## 보안·운영 메모

- **연락처 버튼 배치**: '바로 전화하기 / 카카오톡 상담' 버튼 블록은 **홈에만** 둡니다. 신청 폼 페이지에서는 폼에 집중시키기 위해 감추고, 웹훅 전송 실패 안내 박스 안에서만 예외적으로 노출합니다. 하단 고정 플로팅 버튼은 모든 페이지에 유지됩니다.
- **개인정보 미저장**: 신청 내용은 DB에 남지 않고 Discord로만 전달됩니다. 웹훅 전송이 실패하면 접수가 유실되므로, 사용자에게 실패를 알리고 전화·카카오톡 안내를 노출합니다.
- **Honeypot**: 두 폼에 숨김 필드 `website`가 있으며, 값이 채워지면 봇으로 간주해 전송 없이 성공한 것처럼 응답합니다.
- **Rate Limit**: IP당 15분에 5회. 초과 시 전화·카톡 버튼이 있는 429 페이지를 렌더링합니다.
- **CSP**: Tailwind Play CDN이 브라우저에서 CSS를 컴파일하므로 `script-src`에 `'unsafe-eval'`, `style-src`에 `'unsafe-inline'`이 필요합니다. 빌드 타임 Tailwind(CLI/PostCSS)로 전환하면 두 항목을 제거할 수 있습니다.
- **프록시**: `trust proxy = 1`로 설정되어 있어 nginx 등 리버스 프록시 1단 뒤에서 클라이언트 IP를 정확히 인식합니다.

## 배포 전 체크리스트

- [ ] **`.env`의 `SITE_URL`을 실제 도메인으로 변경** — 현재 `https://example.com`. production 기동 시 경고가 출력됩니다
- [x] `AGENT_NAME`, `AGENT_EMAIL` 설정
- [ ] `public/images/og-image.png` 추가 — 카카오톡 공유 미리보기용. **1200 × 630 px, 1MB 이하.**
      파일이 없으면 `og:image` 태그 자체를 생략하므로(깨진 썸네일 대신 제목·설명만 표시) 없어도 동작은 정상이며, 서버 기동 시 안내 로그가 출력됩니다.
      **존재 여부는 기동 시 1회만 검사하므로, 나중에 파일을 넣었다면 서버를 재시작해야 태그가 반영됩니다.**
- [ ] `src/controllers/page.controller.ts`의 `PARTNER_INSURERS` 실제 취급사로 수정
- [ ] `src/views/privacy.ejs`의 시행일자 확인
- [ ] `npm run deploy` → `npx pm2 save` → `npx pm2 startup`
- [ ] HTTPS 적용 (개인정보 전송 구간 암호화) — 프록시에서 종단 처리
