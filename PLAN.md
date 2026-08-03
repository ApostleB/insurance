# 보험설계사 홈페이지 개발 프롬프트

당신은 Node.js, Express, TypeScript, EJS를 활용한 풀스택 웹 개발 전문가입니다.

여러 보험사의 상품을 취급하는 '독립 보험설계사'를 위한 홈페이지를 구축 중입니다.

사용자의 90% 이상이 모바일로 접속할 것으로 예상되므로, 모바일 친화적(Mobile-First)인 반응형 디자인이 매우 중요합니다.

아래 요구사항에 맞춰 디렉토리 구조, 서버 설정, Tailwind CSS가 적용된 EJS 템플릿 코드, 그리고 상황별 알림 기능이 포함된 완벽한 코드를 작성해주세요.

---

## [변경 이력 — 이후 작업 시 반드시 준수]

1. **파일 업로드 기능 제외**
   영수증·진단서 등 서류는 웹에서 업로드받지 않는다. 신청이 접수되면 설계사가 직접 연락하여
   필요한 서류를 안내한다. → multer / 파일 저장 / Discord 파일 첨부 요구사항 전부 폐기.

2. **데이터베이스 제외 (DB 없음)**
   신청 내용을 서버에 저장하지 않는다. PostgreSQL / Prisma / DATABASE_URL 전부 폐기.
   접수 내용은 **Discord 웹훅으로 전달하는 것이 유일한 처리 경로**이다.
   (설계사가 Discord 알림을 보고 고객에게 직접 회신 전화)

3. **수집 항목 최소화**
   두 폼 모두 **이름 / 연락처 / 상세내용** 세 가지만 입력받고 전송한다.
   나이·성별·보험종류·희망시간대·보험사명·사고유형·사고일자 등 그 외 항목은 만들지 않는다.
   (개인정보 수집 동의 체크박스는 법적 요건이므로 유지)

4. **연락처 버튼('바로 전화하기 / 카카오톡 상담')은 홈에만 배치**
   설계신청(`/consultation`)·청구신청(`/claim`) 페이지 본문에는 이 버튼 블록을 넣지 않는다.
   신청 폼에 집중시키기 위함이며, **예외적으로 웹훅 전송 실패 안내 박스 안에서만** 노출한다.
   (하단 고정 플로팅 버튼은 별개이며 모든 페이지에 유지)

---

## [기술 스택]

- Runtime: Node.js (TypeScript)
- Framework: Express
- Template Engine: EJS
- CSS Framework: Tailwind CSS (CDN 방식 사용)
- HTTP Client: native fetch
- Validation: zod (req.body 타입 추론까지 zod 스키마의 `z.infer`로 해결)
- 보안: helmet, express-rate-limit
- 로깅: morgan
- **데이터베이스 없음 / ORM 없음 / 파일 업로드 없음**

---

## [환경변수 (.env) 설정 및 용도]

반드시 `.env` 파일에 아래 변수들을 설정하고, 시스템 및 프론트엔드에서 활용할 수 있도록 구성해주세요.
`.env.example` 파일도 함께 생성해주세요.

```bash
# ── 서버 ──────────────────────────────────────
NODE_ENV=development            # development | production
PORT=3000

# ── 디스코드 웹훅 (상황별 호출) ────────────────
DISCORD_WEBHOOK_GENERAL=https://discord.com/api/webhooks/XXXX/XXXX
DISCORD_WEBHOOK_CONSULTATION=https://discord.com/api/webhooks/XXXX/XXXX
DISCORD_WEBHOOK_CLAIM=https://discord.com/api/webhooks/XXXX/XXXX

# ── 연락처 정보 (EJS 템플릿으로 전달하여 렌더링) ─
CONTACT_PHONE=010-1234-1234
KAKAO_OPEN_PROFILE_URL=https://open.kakao.com/o/xxxxxxxx

# ── 사이트 메타 (SEO) ─────────────────────────
SITE_URL=https://example.com    # canonical, og:url, sitemap 생성에 사용
SITE_NAME=OOO 보험설계사

# ── 설계사 정보 (뷰 렌더링용, 선택) ─────────────
AGENT_NAME=홍길동
AGENT_EMAIL=agent@example.com   # 개인정보 보호책임자 연락처
```

서버 시작 시 필수 환경변수 누락 여부를 zod로 검증하고, 누락 시 명확한 에러 메시지와 함께 종료되도록 `src/config/env.ts` 모듈을 만들어주세요.

---

## [페이지 및 핵심 기능 요구사항]

### 1. 공통 레이아웃 (EJS Partials)

- header, footer 등 공통 요소를 분리.
- Tailwind CSS CDN을 헤더에 포함.
- Express에서 `CONTACT_PHONE`과 `KAKAO_OPEN_PROFILE_URL`을 `app.locals` 또는 Controller를 통해 EJS 뷰로 전달하여, 모든 페이지 하단이나 모바일 고정 메뉴(Floating Button)에서 즉시 '전화걸기(tel:)'와 '카카오톡 상담'으로 연결될 수 있도록 구현해주세요.
- **[SEO] 공통 head partial에 다음을 포함해주세요:**
  - 페이지별로 주입 가능한 `<title>`, `<meta name="description">`
  - Open Graph 태그 (`og:title`, `og:description`, `og:url`, `og:image`, `og:type`) — 카카오톡/SNS 공유 시 미리보기 최적화
  - `<link rel="canonical">`, favicon, `<meta name="viewport">`
- **[SEO] `GET /sitemap.xml`과 `GET /robots.txt` 라우트를 추가해주세요.** (정적 페이지 목록 기반의 간단한 구현이면 충분)

### 2. 본인소개 (GET /)

- 모바일 화면(스마트폰 세로 뷰)에 꽉 차게 잘 보이도록 설계사의 프로필과 취급 보험사 목록을 카드(Card) 형태로 배치한 메인 페이지(index.ejs) 렌더링.

### 3. 설계신청 (Consultation Request)

- `GET /consultation` : **이름 / 연락처 / 상세내용** 세 가지만 입력받는 폼 렌더링.
  - 본문에는 연락처 버튼(전화·카톡)을 배치하지 않는다. ([변경 이력] 4번 참고 — 홈에만 배치)
  - **[필수] 폼 하단에 '개인정보 수집 및 이용 동의' 안내문을 읽기 전용 textarea로 제공하고, 반드시 체크해야만 폼이 제출되도록 `required` 속성이 적용된 체크박스(privacyConsent)를 추가해주세요.** 안내문 옆에 `/privacy` 전문 보기 링크도 배치해주세요.
- `POST /consultation` :
  1) zod 스키마로 요청 본문 전체를 검증 (`privacyConsent`가 true인지 포함). 이름/전화번호 형식(한국 휴대폰 번호 정규식) 검증.
  2) **DB 저장 없이** `DISCORD_WEBHOOK_CONSULTATION`으로 Discord Embed 알림 전송. **알림에는 고객 이름과 전화번호를 마스킹 없이 그대로 포함하여, 알림만 보고 바로 회신 전화가 가능하도록 해주세요.**
  3) 성공 페이지로 리다이렉트.

### 4. 청구신청 (Claim Request)

- `GET /claim` : **이름 / 연락처 / 상세내용** 세 가지만 입력받는 폼 렌더링. **파일 첨부 기능은 없습니다.**
  - 폼 상단과 성공 페이지에 "영수증·진단서 등 서류는 접수 후 설계사가 직접 연락드려 안내합니다"라는 안내 문구를 명확히 노출해주세요.
  - **[필수] 여기에도 설계신청과 동일하게 '개인정보 수집 및 이용 동의' 안내문과 필수 체크박스, `/privacy` 링크를 추가해주세요.**
- `POST /claim` :
  1) zod로 본문 검증(`privacyConsent` 포함).
  2) **DB 저장 없이** `DISCORD_WEBHOOK_CLAIM`으로 Discord Embed 알림 전송 (이름·연락처 마스킹 없음).
  3) 성공 페이지로 리다이렉트.

### 5. 개인정보처리방침 (GET /privacy)

- 개인정보 수집 항목, 수집 목적, 보유 기간, 파기 절차, 개인정보 보호책임자 연락처를 포함한 개인정보처리방침 정적 페이지를 렌더링해주세요.
- **DB에 저장하지 않고 설계사에게 즉시 전달 후 상담 목적으로만 이용한다**는 점을 방침에 반영해주세요.
- 내용은 보험 상담 사이트에 맞는 표준적인 템플릿으로 작성하되, 설계사 이름/연락처 부분은 치환하기 쉽게 표시해주세요.
- footer에 `/privacy` 링크를 상시 노출해주세요.

---

## [보안 요구사항]

1. **helmet** 미들웨어 적용. (Tailwind CDN 사용을 고려한 CSP 설정 포함 — 또는 CSP만 비활성화하고 사유를 주석으로 명시)
2. **Rate Limiting**: `express-rate-limit`으로 `POST /consultation`, `POST /claim`에 IP당 제한(예: 15분에 5회)을 적용해주세요. 초과 시 사용자 친화적인 에러 페이지/메시지 반환.
3. **Honeypot 스팸 방지**: 두 폼에 사람 눈에 보이지 않는 숨김 필드(예: `website`)를 추가하고, 이 필드가 채워진 요청은 봇으로 간주하여 전송 없이 성공한 것처럼 응답해주세요.
4. **본문 크기 제한**: `express.urlencoded`에 `limit`을 지정해 과도한 페이로드를 차단해주세요.

---

## [에러 처리 요구사항]

1. **Discord 웹훅 실패 처리**: 웹훅이 유일한 전달 경로이므로, 전송 실패 시 사용자에게 "접수에 실패했으니 전화/카톡으로 연락 부탁드립니다"라는 안내와 함께 연락처 버튼을 보여주는 폼 재렌더링을 해주세요. 실패 로그도 남겨주세요.
2. **검증 실패 시 프론트로 에러 전달**: zod 검증 실패 시 400과 함께 **어떤 필드가 왜 잘못됐는지** 필드별 에러 메시지를 폼 페이지에 다시 렌더링하고, 사용자가 입력했던 값은 유지해주세요. (에러 메시지는 입력 필드 바로 아래에 빨간 텍스트로 표시)
3. **글로벌 에러 핸들러**: 404 페이지와 500 페이지를 각각 커스텀 EJS 템플릿으로 만들고, Express 글로벌 에러 미들웨어에서 처리해주세요. 500 에러 발생 시 스택 트레이스는 로그에만 남기고 사용자에게는 노출하지 마세요.
4. **중복 제출 방지**: 제출 버튼 클릭 시 버튼을 비활성화하고 로딩 상태("전송 중...")를 표시하는 최소한의 클라이언트 스크립트를 포함해주세요.

---

## [코드 작성 및 구조 조건]

1. `src/` 폴더 내에 `views`(EJS), `routes`, `controllers`, `services`를 분리한 MVC 디렉토리 구조를 제시하세요. (`config`, `middlewares`, `schemas` 폴더 추가)
2. 디스코드 알림 모듈화 (재사용성 확보). 알림 종류(general/consultation/claim)별 웹훅을 하나의 서비스 모듈에서 처리.
   - **상세내용은 Embed field가 아니라 description에 담을 것.** 입력 상한은 2000자인데 field value 한도는 1024자라, field에 넣으면 긴 내용의 뒷부분이 잘리고 DB가 없어 복구할 수 없다. description은 4096자까지 허용된다.
   - 응답 대기 8초 타임아웃. 5xx/429처럼 서버가 명시적으로 거부한 경우에만 1회 재시도하고, 타임아웃·네트워크 오류는 중복 전송 위험 때문에 재시도하지 않는다.
3. 요청 본문 타입은 zod 스키마에서 `z.infer`로 추론하여 별도 Interface 중복 정의 없이 사용 (privacyConsent 포함).
4. 모든 EJS 템플릿에 Tailwind CSS 클래스를 활용하여 PC에서도 무리가 없으나 모바일에서 최상의 경험을 제공하도록 코드를 작성해 주세요.
5. `GET /health` 헬스체크 엔드포인트와 `morgan` 요청 로깅을 추가해주세요.

---

## [배포]

**PM2 `ecosystem.config.js`로 배포한다.**

- `npm run deploy` = `npm run build && pm2 startOrReload ecosystem.config.js --update-env`
- `instances: 1`, `exec_mode: fork` 고정 — rate-limit이 인메모리라 인스턴스를 늘리면 IP당 제한이 느슨해진다. 늘리려면 Redis 등 공유 저장소를 먼저 붙일 것.
- `kill_timeout: 11000` — `server.ts`의 graceful shutdown(최대 10초)보다 길게 잡아야 처리 중인 요청이 잘리지 않는다.
- `env.NODE_ENV=production` — dotenv는 기존 환경변수를 덮어쓰지 않으므로 `.env`에 development가 남아 있어도 production이 유지된다.
- `.env`와 `public/images/og-image.png`는 저장소에 없으므로 서버에 직접 올린다.
- 원격 자동 배포가 필요하면 `ecosystem.config.js` 하단 `deploy` 블록 주석을 해제해 사용한다.
