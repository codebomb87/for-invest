"""
IP Logger Server — Production Ready
접속자 IP 로깅 + 관리자 대시보드 + CSV 다운로드
"""

import csv
import io
import json
import logging
import os
import secrets
from datetime import datetime
from functools import wraps
from logging.handlers import TimedRotatingFileHandler

from flask import (
    Flask,
    Response,
    jsonify,
    render_template,
    request,
    send_file,
    abort,
)

# ─────────────────────────────────────────────────────────────────
# 앱 초기화
# ─────────────────────────────────────────────────────────────────
app = Flask(__name__)

# ─────────────────────────────────────────────────────────────────
# 설정 (환경변수 우선, 없으면 기본값)
# ─────────────────────────────────────────────────────────────────
LOG_DIR           = os.environ.get("LOG_DIR",           os.path.join(os.path.dirname(__file__), "logs"))
LOG_FILE          = os.path.join(LOG_DIR, "access.log")
ADMIN_TOKEN       = os.environ.get("ADMIN_TOKEN",       "change-me-in-production")  # 필수 변경
MAX_DOWNLOAD_ROWS = int(os.environ.get("MAX_DOWNLOAD_ROWS", 100))
LOG_BACKUP_DAYS   = int(os.environ.get("LOG_BACKUP_DAYS",  30))    # 보관 일수
TRUST_PROXY       = os.environ.get("TRUST_PROXY", "true").lower() == "true"
APP_SECRET        = os.environ.get("APP_SECRET",        secrets.token_hex(32))

app.secret_key = APP_SECRET

os.makedirs(LOG_DIR, exist_ok=True)

# ─────────────────────────────────────────────────────────────────
# CSV 구조화 로거 (날짜별 로테이션, 30일 보관)
# ─────────────────────────────────────────────────────────────────
csv_logger = logging.getLogger("ip_access")
csv_logger.setLevel(logging.INFO)
csv_logger.propagate = False  # Flask 기본 로거와 분리

_handler = TimedRotatingFileHandler(
    LOG_FILE,
    when="midnight",
    interval=1,
    backupCount=LOG_BACKUP_DAYS,
    encoding="utf-8",
    utc=False,
)
_handler.setFormatter(logging.Formatter("%(message)s"))
csv_logger.addHandler(_handler)

# 헤더 없는 새 파일이면 CSV 헤더 추가
if not os.path.exists(LOG_FILE) or os.path.getsize(LOG_FILE) == 0:
    with open(LOG_FILE, "w", encoding="utf-8", newline="") as f:
        csv.writer(f).writerow(
            ["timestamp", "ip", "method", "path", "status", "user_agent"]
        )


# ─────────────────────────────────────────────────────────────────
# 유틸: 실제 IP 추출
# ─────────────────────────────────────────────────────────────────
def get_real_ip() -> str:
    if TRUST_PROXY:
        forwarded = request.headers.get("X-Forwarded-For", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
        real_ip = request.headers.get("X-Real-IP", "")
        if real_ip:
            return real_ip
    return request.remote_addr or "unknown"


# ─────────────────────────────────────────────────────────────────
# 미들웨어: 모든 응답 후 자동 로깅 + 보안 헤더
# ─────────────────────────────────────────────────────────────────
@app.after_request
def after_request(response):
    # 보안 헤더
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"]        = "DENY"
    response.headers["X-XSS-Protection"]       = "1; mode=block"

    # /admin 자체는 로그 제외 (선택 — 포함하고 싶으면 조건 제거)
    if not request.path.startswith("/admin"):
        _write_log(response.status_code)

    return response


def _write_log(status_code: int):
    row = [
        datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        get_real_ip(),
        request.method,
        request.path[:500],
        status_code,
        (request.user_agent.string or "")[:300],
    ]
    csv_logger.info(",".join(f'"{str(v).replace(chr(34), chr(39))}"' for v in row))


# ─────────────────────────────────────────────────────────────────
# 인증 데코레이터 (Bearer 토큰 or ?token= 쿼리)
# ─────────────────────────────────────────────────────────────────
def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        # Authorization: Bearer <token>
        auth_header = request.headers.get("Authorization", "")
        token_header = auth_header.removeprefix("Bearer ").strip()
        # ?token=<token> (대시보드 브라우저 접근용)
        token_query = request.args.get("token", "")
        token = token_header or token_query

        if not secrets.compare_digest(token, ADMIN_TOKEN):
            return Response(
                json.dumps({"error": "Unauthorized"}),
                status=401,
                mimetype="application/json",
                headers={"WWW-Authenticate": 'Bearer realm="admin"'},
            )
        return f(*args, **kwargs)
    return decorated


# ─────────────────────────────────────────────────────────────────
# 서비스 라우트 (실제 서비스 라우트로 교체)
# ─────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return "<h1>메인 페이지</h1><p>접속이 기록되었습니다.</p>"

@app.route("/about")
def about():
    return "<h1>소개 페이지</h1>"

# ─────────────────────────────────────────────────────────────────
# GET /admin
#   관리자 대시보드 HTML
#   인증: ?token=<ADMIN_TOKEN>
# ─────────────────────────────────────────────────────────────────
@app.route("/admin")
@require_auth
def admin_dashboard():
    token = request.args.get("token", "")
    with open(os.path.join(os.path.dirname(__file__), "templates", "admin.html"),
              encoding="utf-8") as f:
        html = f.read().replace("__ADMIN_TOKEN__", token)
    return html


# ─────────────────────────────────────────────────────────────────
# GET /admin/logs
#   최근 N건 로그 JSON 반환
#   Query: limit (기본 100), page (기본 1)
#   인증: Bearer 토큰
# ─────────────────────────────────────────────────────────────────
@app.route("/admin/logs")
@require_auth
def get_logs():
    limit = min(int(request.args.get("limit", MAX_DOWNLOAD_ROWS)), 1000)
    page  = max(int(request.args.get("page", 1)), 1)
    rows  = _read_all_logs()
    total = len(rows)
    start = (page - 1) * limit
    paged = list(reversed(rows))[ start : start + limit ]
    return jsonify({
        "total":    total,
        "page":     page,
        "limit":    limit,
        "pages":    (total + limit - 1) // limit,
        "logs":     paged,
    })


# ─────────────────────────────────────────────────────────────────
# GET /admin/logs/download
#   최근 N건 CSV 파일 다운로드
#   Query: limit (기본 100)
#   인증: Bearer 토큰 or ?token=
# ─────────────────────────────────────────────────────────────────
@app.route("/admin/logs/download")
@require_auth
def download_logs():
    limit = min(int(request.args.get("limit", MAX_DOWNLOAD_ROWS)), 10000)
    rows  = list(reversed(_read_all_logs()))[:limit]

    buf = io.StringIO()
    w   = csv.writer(buf)
    w.writerow(["번호", "접속시간", "IP주소", "메서드", "경로", "상태코드", "User-Agent"])
    for i, r in enumerate(rows, 1):
        w.writerow([i, r.get("timestamp"), r.get("ip"), r.get("method"),
                    r.get("path"), r.get("status"), r.get("user_agent")])
    buf.seek(0)

    filename = f"access_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return send_file(
        io.BytesIO(buf.read().encode("utf-8-sig")),  # BOM: 엑셀 한글 지원
        mimetype="text/csv; charset=utf-8-sig",
        as_attachment=True,
        download_name=filename,
    )


# ─────────────────────────────────────────────────────────────────
# GET /admin/stats
#   집계 통계 JSON (고유 IP, 시간대별 분포 등)
#   인증: Bearer 토큰
# ─────────────────────────────────────────────────────────────────
@app.route("/admin/stats")
@require_auth
def get_stats():
    rows = _read_all_logs()
    ips  = [r.get("ip") for r in rows]
    from collections import Counter
    ip_counts   = Counter(ips).most_common(10)
    hour_counts = Counter(
        r.get("timestamp", "")[:13]   # "YYYY-MM-DD HH"
        for r in rows if r.get("timestamp")
    )
    return jsonify({
        "total_requests": len(rows),
        "unique_ips":     len(set(ips)),
        "top_ips":        [{"ip": ip, "count": c} for ip, c in ip_counts],
        "hourly":         dict(sorted(hour_counts.items())[-24:]),  # 최근 24시간
    })


# ─────────────────────────────────────────────────────────────────
# GET /admin/log-files
#   로테이션된 파일 목록 + 크기 JSON
#   인증: Bearer 토큰
# ─────────────────────────────────────────────────────────────────
@app.route("/admin/log-files")
@require_auth
def list_log_files():
    files = []
    for fname in sorted(os.listdir(LOG_DIR), reverse=True):
        fpath = os.path.join(LOG_DIR, fname)
        if os.path.isfile(fpath):
            size_kb = round(os.path.getsize(fpath) / 1024, 1)
            mtime   = datetime.fromtimestamp(os.path.getmtime(fpath)).strftime("%Y-%m-%d %H:%M:%S")
            files.append({"name": fname, "size_kb": size_kb, "modified": mtime})
    return jsonify(files)


# ─────────────────────────────────────────────────────────────────
# GET /health
#   헬스체크 (인증 불필요 — 로드밸런서/k8s probe 용)
# ─────────────────────────────────────────────────────────────────
@app.route("/health")
def health():
    return jsonify({"status": "ok", "ts": datetime.now().isoformat()})


# ─────────────────────────────────────────────────────────────────
# 헬퍼
# ─────────────────────────────────────────────────────────────────
def _read_all_logs() -> list[dict]:
    if not os.path.exists(LOG_FILE):
        return []
    with open(LOG_FILE, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


# ─────────────────────────────────────────────────────────────────
# 에러 핸들러
# ─────────────────────────────────────────────────────────────────
@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Not found"}), 404

@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "Internal server error"}), 500


# ─────────────────────────────────────────────────────────────────
# 로컬 개발 실행 (프로덕션은 gunicorn 사용)
# ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"[DEV]  관리자 페이지 → http://localhost:5000/admin?token={ADMIN_TOKEN}")
    print(f"[DEV]  로그 위치     → {LOG_FILE}")
    print("[WARN] 프로덕션에서는 gunicorn을 사용하세요.")
    app.run(host="0.0.0.0", port=5000, debug=False)
