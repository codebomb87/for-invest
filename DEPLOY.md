# forInvest 배포 가이드

이 문서는 forInvest를 인터넷에 배포하는 방법을 설명합니다.

## 시작 전에 꼭 알아야 할 것: 데이터 저장 문제

이 앱은 계좌·보유 종목·거래 내역을 **SQLite 파일**(`data/forinvest.db`)에 저장합니다.
그런데 Vercel은 서버리스 방식이라 **함수가 실행될 때마다 파일 시스템이 초기화**됩니다.
즉, Vercel에 그대로 배포하면 사이트는 뜨지만 **거래 데이터가 수시로 사라집니다.**

그래서 목적에 따라 세 가지 길이 있습니다.

| 옵션 | 데이터 유지 | 난이도 | 추천 대상 |
|------|------------|--------|----------|
| A. Render/Railway 등 상시 서버 | O | 쉬움 | 데이터 유지가 중요하면 이쪽 |
| B. Vercel + 외부 DB (Turso 등) | O | 중간 | Vercel을 꼭 쓰고 싶을 때 |
| C. Vercel 그대로 (데모용) | X (수시 리셋) | 가장 쉬움 | 화면만 보여주는 용도 |

추후 키움 API 연동·자동매매까지 생각하면 **상시 실행 서버(옵션 A)** 가 어차피 필요하므로 A를 권장합니다.
(자동매매는 24시간 돌아야 하는데 서버리스는 요청이 있을 때만 실행됨)

---

## 공통 준비: GitHub에 올리기

모든 옵션은 GitHub 저장소가 필요합니다.

```powershell
cd C:\Users\dlago\Claude\Projects\forInvest
git init
git add .
git commit -m "forInvest 초기 버전"
```

GitHub에서 새 저장소(예: `forinvest`)를 만든 뒤:

```powershell
git remote add origin https://github.com/<내아이디>/forinvest.git
git branch -M main
git push -u origin main
```

> `data/` 폴더(거래 데이터)와 `node_modules`는 `.gitignore`에 이미 제외되어 있습니다.

---

## 옵션 C: Vercel에 바로 배포 (데모용, 가장 쉬움)

1. https://vercel.com 가입 (GitHub 계정으로 로그인 권장)
2. **Add New → Project** → GitHub에서 `forinvest` 저장소 Import
3. Framework는 Next.js로 자동 인식됨. 설정 두 가지만 변경:
   - **Settings → General → Node.js Version** → **22.x** 선택
     (이 앱은 Node 22 내장 SQLite를 사용하므로 필수)
   - **Settings → Environment Variables** → 추가:
     - Name: `DATA_DIR` / Value: `/tmp/forinvest-data`
     (서버리스에서 유일하게 쓰기 가능한 경로. 단, 임시 저장이라 수시로 초기화됨)
4. **Deploy** 클릭 → 1~2분 후 `https://<프로젝트명>.vercel.app` 주소 발급

### Vercel 배포 시 추가 주의

- **Yahoo 요청 차단(429)**: Vercel 같은 데이터센터 IP는 집 IP보다 Yahoo가 더 자주 차단합니다.
  지수/시세가 안 뜨면 이 때문일 가능성이 큽니다. (앱은 죽지 않고 캐시/빈 화면으로 동작)
- **공개 주소**: 배포하면 누구나 접속해 모의 거래를 할 수 있습니다.
  본인만 쓰려면 Vercel의 Deployment Protection(비밀번호/로그인) 기능을 켜세요.
  **추후 실계좌 API 키를 넣게 되면 절대 공개 상태로 두면 안 됩니다.**

---

## 옵션 A: Render/Railway에 배포 (데이터 유지, 권장)

> **상세 단계별 가이드는 `DEPLOY-RENDER-RAILWAY.md` 참고** (요금, 디스크/볼륨 설정 포함)

Render(https://render.com)는 상시 실행 서버 + 디스크를 제공해 SQLite가 그대로 동작합니다.

1. Render 가입 → **New → Web Service** → GitHub 저장소 연결
2. 설정:
   - Runtime: **Node**
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Environment Variables: `NODE_VERSION` = `22.13.0` (또는 그 이상)
3. 데이터 유지를 위해 **Disk 추가** (Settings → Disks):
   - Mount Path: `/var/data`
   - 환경변수 `DATA_DIR` = `/var/data` 추가
4. Deploy → `https://<서비스명>.onrender.com` 발급

> 무료 플랜은 15분 동안 접속이 없으면 잠들었다가 첫 접속 시 깨어납니다(수십 초 지연).
> Railway, Fly.io도 거의 같은 방식으로 배포할 수 있습니다.

---

## 옵션 B: Vercel + 외부 DB

Vercel을 유지하면서 데이터도 보존하려면 SQLite 대신 외부 DB를 씁니다.

- **Turso** (libSQL): SQLite 호환이라 코드 변경이 가장 적음. 무료 플랜 충분.
- **Neon / Vercel Postgres**: Postgres 기반. `lib/db.ts`와 `lib/broker/simulated.ts`의 쿼리를 Postgres 문법으로 수정 필요.

이 프로젝트는 DB 접근이 `lib/db.ts`와 `lib/broker/simulated.ts` 두 파일에만 모여 있어서
교체 범위가 좁습니다. 이 옵션을 원하면 그때 같이 작업하면 됩니다.

---

## 배포 후 확인 체크리스트

- [ ] 메인 페이지가 뜨는가
- [ ] `/api/account` 가 계좌 JSON을 반환하는가
- [ ] 종목 검색이 되는가 (안 되면 Yahoo 차단 가능성 — 서버 로그 확인)
- [ ] 매수 → 보유 종목 반영 → 새로고침 후에도 유지되는가 (옵션 C는 유지 안 됨이 정상)

## 로컬 개발은 그대로

배포와 무관하게 로컬에서는 항상 `npm run dev` (http://localhost:3000) 로 개발/연습할 수 있습니다.
