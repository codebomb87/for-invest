# forInvest — Render / Railway 배포 상세 가이드

`DEPLOY.md`의 옵션 A(상시 서버)를 실제로 진행하는 단계별 문서입니다.
두 플랫폼 모두 상시 실행 서버라 SQLite 파일이 그대로 동작하고,
추후 키움 API 자동매매(24시간 실행)에도 그대로 쓸 수 있습니다.

## 어느 쪽을 고를까?

| | Render | Railway |
|---|---|---|
| 무료로 시작 | O (단, 아래 제약) | 가입 시 1회 무료 크레딧, 이후 유료 |
| 무료 플랜 제약 | 15분 미접속 시 잠듦 + **잠들 때 SQLite 데이터 삭제** | 무료 크레딧 소진 후 중지 |
| 데이터 유지 비용 | Starter 인스턴스 약 $7/월 + 디스크 $0.25/GB/월 | Hobby $5/월 (사용량 $5 포함) + 볼륨 $0.15/GB/월 |
| 난이도 | 쉬움 | 쉬움 |

요약:
- **일단 무료로 띄워보기** → Render 무료 (데이터가 가끔 리셋되는 것만 감수)
- **데이터 유지하면서 가장 저렴하게** → Railway Hobby (월 $5 정도)

---

## 공통 준비

`DEPLOY.md`의 "공통 준비: GitHub에 올리기"를 먼저 완료하세요 (git push까지).

이 프로젝트는 배포 친화적으로 이미 설정돼 있습니다:
- `package.json`의 `engines.node: ">=22.13.0"` → 플랫폼이 Node 22를 자동 선택
- `DATA_DIR` 환경변수 → SQLite 저장 위치 변경 가능
- `npm start`가 플랫폼이 주는 `PORT`를 자동으로 사용

---

## Render 배포

### 1단계: 서비스 생성

1. https://render.com 가입 (GitHub 계정으로 로그인)
2. 대시보드에서 **New → Web Service**
3. **Git Provider** 탭에서 `forinvest` 저장소 선택 (처음이면 GitHub 연동 승인)
4. 설정 입력:

| 항목 | 값 |
|---|---|
| Name | `forinvest` (원하는 이름) |
| Region | `Singapore` (한국에서 가장 가까움) |
| Branch | `main` |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Instance Type | `Free` (또는 데이터 유지하려면 `Starter`) |

5. **Create Web Service** 클릭 → 첫 빌드 3~5분 → `https://forinvest-xxxx.onrender.com` 발급

### 2단계 (선택): 데이터 유지 — 유료 Starter + 디스크

무료 플랜은 15분간 접속이 없으면 잠들고, **잠들 때 SQLite 파일이 삭제**됩니다.
연습 기록을 유지하려면:

1. 서비스 페이지 → **Settings → Instance Type** → `Starter`로 변경
2. **Disks → Add Disk**:
   - Name: `data`
   - Mount Path: `/var/data`
   - Size: `1 GB` (충분함)
3. **Environment → Add Environment Variable**:
   - Key: `DATA_DIR` / Value: `/var/data`
4. 저장하면 자동 재배포 → 이후 거래 데이터가 영구 보존됨

### Render 팁

- 무료 플랜은 잠든 뒤 첫 접속이 30초~1분 느립니다 (깨어나는 시간).
- 로그 확인: 서비스 페이지 → **Logs** 탭. `[market/...]` 로그로 Yahoo 차단 여부 확인 가능.
- 코드 수정 후 `git push`만 하면 자동 재배포됩니다.

---

## Railway 배포

### 1단계: 프로젝트 생성

1. https://railway.com 가입 (GitHub 계정으로 로그인)
2. **New Project → Deploy from GitHub repo** → `forinvest` 선택
3. 자동으로 빌드 시작 (Next.js와 Node 버전을 자동 감지 — `engines` 필드 사용)
4. 빌드 완료 후 서비스 클릭 → **Settings → Networking → Generate Domain**
   → `https://forinvest-production-xxxx.up.railway.app` 발급

> 빌드/시작 명령을 따로 물어보면: Build `npm install && npm run build`, Start `npm start`

### 2단계: 데이터 유지 — 볼륨 연결

1. 프로젝트 캔버스에서 서비스 우클릭 → **Attach Volume** (또는 서비스 → Settings → Volumes)
2. Mount Path: `/data`
3. 서비스 → **Variables → New Variable**:
   - `DATA_DIR` = `/data`
4. 자동 재배포 → 거래 데이터 영구 보존

### Railway 팁

- 요금: Hobby 플랜 $5/월에 사용량 $5가 포함되어, 이 정도 작은 앱은 보통 추가 요금 없이 커버됩니다. 볼륨은 $0.15/GB/월.
- 사용량 확인: 프로젝트 → **Usage** 탭.
- 로그: 서비스 클릭 → **Deployments → View Logs**.
- `git push` 시 자동 재배포.

---

## 배포 후 확인 체크리스트

- [ ] 메인 페이지 접속
- [ ] `/api/account` 가 계좌 JSON 반환
- [ ] 종목 검색 동작 (안 되면 로그에서 `[market/search]` 확인 — 데이터센터 IP는 Yahoo가 차단할 수 있음)
- [ ] 매수 후 보유 종목 반영
- [ ] (디스크/볼륨 설정 시) 재배포 후에도 거래 내역 유지

## 보안 주의

배포 주소는 누구나 접속 가능합니다. 지금은 모의 투자라 위험이 없지만:
- 본인만 쓰려면 접속 제한을 거세요 (Render: 무료로는 불가, Railway: 직접 인증 추가 필요 — 필요해지면 간단한 비밀번호 로그인을 같이 구현하면 됩니다)
- **추후 키움 등 실계좌 API 키를 추가하는 시점에는 반드시 비공개/인증 상태**여야 합니다. API 키는 코드가 아닌 환경변수에만 저장하세요.

## Yahoo 시세 차단 관련

Render/Railway 같은 데이터센터 IP는 집 IP보다 Yahoo가 요청을 더 자주 차단(429)할 수 있습니다.
앱은 차단 시 캐시로 동작하도록 만들어져 있지만, 배포 환경에서 시세가 자주 비면
한국투자증권(KIS) 같은 정식 시세 API로 교체하는 것이 근본 해결책입니다 (무료, API 키 필요).
