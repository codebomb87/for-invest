# IP Logger

접속자 IP 주소와 시간을 자동으로 기록하고, 관리자 페이지에서 조회 및 CSV 다운로드할 수 있는 Flask 서버입니다.

---

## 파일 구조

```
ip_logger/
├── server.py           # 메인 Flask 애플리케이션
├── gunicorn.conf.py    # 프로덕션 Gunicorn 설정
├── Dockerfile          # 컨테이너 배포 설정
├── nginx.conf          # Nginx 리버스 프록시 설정 예시
├── requirements.txt    # Python 의존성
├── .env.example        # 환경변수 예시 (→ .env 로 복사)
├── templates/
│   └── admin.html      # 관리자 대시보드 UI
└── logs/
    ├── access.log          # 현재 로그 (자동 생성)
    └── access.log.YYYY-MM-DD  # 날짜별 로테이션 파일
```

---

## 빠른 시작 (로컬 개발)

```bash
# 1. 환경변수 설정
cp .env.example .env
# .env 파일을 열어 ADMIN_TOKEN 변경

# 2. 의존성 설치
pip install -r requirements.txt

# 3. 실행
python server.py

# 관리자 페이지 접속
# http://localhost:5000/admin?token=<ADMIN_TOKEN>
```

---

## 프로덕션 배포

### 방법 1: Gunicorn (VM/베어메탈)

```bash
# 환경변수 로드 후 Gunicorn 실행
export $(cat .env | xargs)
gunicorn -c gunicorn.conf.py server:app
```

Nginx를 앞단에 두는 경우 `nginx.conf` 파일을 참고해 리버스 프록시를 설정합니다.

```bash
sudo cp nginx.conf /etc/nginx/sites-available/ip-logger
sudo ln -s /etc/nginx/sites-available/ip-logger /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 방법 2: Docker

```bash
# 이미지 빌드
docker build -t ip-logger .

# 컨테이너 실행
docker run -d \
  --name ip-logger \
  -p 5000:5000 \
  -e ADMIN_TOKEN=your-secret-token \
  -v $(pwd)/logs:/app/logs \
  ip-logger
```

### 방법 3: Docker Compose

```yaml
# docker-compose.yml
services:
  ip-logger:
    build: .
    ports:
      - "5000:5000"
    env_file: .env
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped
```

```bash
docker compose up -d
```

---

## 환경변수

| 변수명 | 기본값 | 설명 |
|---|---|---|
| `ADMIN_TOKEN` | `change-me-in-production` | 관리자 API 인증 토큰 **(필수 변경)** |
| `LOG_DIR` | `./logs` | 로그 파일 저장 경로 |
| `MAX_DOWNLOAD_ROWS` | `100` | CSV 다운로드 기본 건수 |
| `LOG_BACKUP_DAYS` | `30` | 로그 파일 보관 일수 |
| `TRUST_PROXY` | `true` | Nginx 뒤에서 X-Forwarded-For 신뢰 여부 |
| `APP_SECRET` | 자동 생성 | Flask 세션 암호화 키 |
| `GUNICORN_BIND` | `0.0.0.0:5000` | Gunicorn 바인딩 주소 |
| `GUNICORN_WORKERS` | `CPU×2+1` | Gunicorn 워커 수 |
| `LOG_LEVEL` | `info` | Gunicorn 로그 레벨 |

---

## API 엔드포인트

### 인증 방법

관리자 엔드포인트(`/admin/*`)는 아래 두 가지 방법 중 하나로 인증합니다.

```
# HTTP 헤더 (API 클라이언트 권장)
Authorization: Bearer <ADMIN_TOKEN>

# URL 쿼리 파라미터 (브라우저 직접 접근 시)
?token=<ADMIN_TOKEN>
```

---

### 공개 엔드포인트

#### `GET /health`
서버 상태 확인. 인증 불필요. 로드밸런서/k8s readiness probe용.

```bash
curl http://localhost:5000/health
```

```json
{ "status": "ok", "ts": "2026-06-16T10:30:00.000000" }
```

---

### 관리자 엔드포인트

#### `GET /admin`
관리자 대시보드 HTML 페이지.

```
http://localhost:5000/admin?token=<ADMIN_TOKEN>
```

---

#### `GET /admin/logs`
최근 접속 로그를 JSON으로 반환합니다.

| 파라미터 | 기본값 | 설명 |
|---|---|---|
| `limit` | `100` | 페이지당 건수 (최대 1000) |
| `page` | `1` | 페이지 번호 |

```bash
curl -H "Authorization: Bearer <TOKEN>" \
  "http://localhost:5000/admin/logs?limit=50&page=1"
```

```json
{
  "total": 1234,
  "page": 1,
  "limit": 50,
  "pages": 25,
  "logs": [
    {
      "timestamp": "2026-06-16 10:30:00",
      "ip": "203.0.113.42",
      "method": "GET",
      "path": "/",
      "status": "200",
      "user_agent": "Mozilla/5.0 ..."
    }
  ]
}
```

---

#### `GET /admin/logs/download`
최근 N건을 CSV 파일로 다운로드합니다. (엑셀 한글 지원)

| 파라미터 | 기본값 | 설명 |
|---|---|---|
| `limit` | `100` | 다운로드 건수 (최대 10000) |

```bash
# 최근 100건
curl -H "Authorization: Bearer <TOKEN>" \
  "http://localhost:5000/admin/logs/download" \
  -o access_log.csv

# 최근 500건
curl -H "Authorization: Bearer <TOKEN>" \
  "http://localhost:5000/admin/logs/download?limit=500" \
  -o access_log.csv
```

---

#### `GET /admin/stats`
집계 통계를 반환합니다. (총 요청 수, 고유 IP 수, 상위 IP, 시간대별 분포)

```bash
curl -H "Authorization: Bearer <TOKEN>" \
  http://localhost:5000/admin/stats
```

```json
{
  "total_requests": 1234,
  "unique_ips": 87,
  "top_ips": [
    { "ip": "203.0.113.42", "count": 50 },
    { "ip": "198.51.100.7", "count": 30 }
  ],
  "hourly": {
    "2026-06-16 08": 120,
    "2026-06-16 09": 95,
    "2026-06-16 10": 140
  }
}
```

---

#### `GET /admin/log-files`
로테이션된 로그 파일 목록과 크기를 반환합니다.

```bash
curl -H "Authorization: Bearer <TOKEN>" \
  http://localhost:5000/admin/log-files
```

```json
[
  { "name": "access.log",            "size_kb": 128.4, "modified": "2026-06-16 10:30:00" },
  { "name": "access.log.2026-06-15", "size_kb": 512.1, "modified": "2026-06-16 00:00:01" },
  { "name": "access.log.2026-06-14", "size_kb": 498.7, "modified": "2026-06-15 00:00:01" }
]
```

---

## 엔드포인트 요약

| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| GET | `/health` | ❌ | 헬스체크 |
| GET | `/admin` | ✅ | 관리자 대시보드 |
| GET | `/admin/logs` | ✅ | 로그 조회 (JSON, 페이징) |
| GET | `/admin/logs/download` | ✅ | 로그 CSV 다운로드 |
| GET | `/admin/stats` | ✅ | 집계 통계 |
| GET | `/admin/log-files` | ✅ | 로그 파일 목록 |

---

## 로그 관리 (로테이션)

로그는 **매일 자정** 자동으로 새 파일로 교체되며 `LOG_BACKUP_DAYS`(기본 30)일치만 보관됩니다.

```
logs/
├── access.log              ← 오늘 로그 (쓰기 중)
├── access.log.2026-06-15   ← 어제
├── access.log.2026-06-14   ← 이틀 전
└── ...                     ← 최대 30개
```

보관 기간을 변경하려면 `.env`에서 `LOG_BACKUP_DAYS`를 수정합니다.

```bash
LOG_BACKUP_DAYS=90  # 90일치 보관
```
