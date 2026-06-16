# gunicorn.conf.py — 프로덕션 Gunicorn 설정

import multiprocessing
import os

# ── 바인딩 ───────────────────────────────────────
bind    = os.environ.get("GUNICORN_BIND", "0.0.0.0:5000")

# ── 워커 ─────────────────────────────────────────
# CPU 코어 수 × 2 + 1 이 일반적인 권장값
workers = int(os.environ.get("GUNICORN_WORKERS", multiprocessing.cpu_count() * 2 + 1))
worker_class = "sync"           # I/O 바운드 작업이 많으면 "gevent" 고려
threads      = 2                # 워커당 스레드

# ── 타임아웃 ─────────────────────────────────────
timeout       = 30              # 요청 처리 최대 시간 (초)
keepalive     = 5               # Keep-Alive 연결 유지 시간 (초)
graceful_timeout = 30           # 재시작 시 기존 워커 종료 대기 시간

# ── 로깅 ─────────────────────────────────────────
accesslog  = "-"                # stdout (컨테이너 환경 권장)
errorlog   = "-"                # stdout
loglevel   = os.environ.get("LOG_LEVEL", "info")
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s"'

# ── 프로세스 ──────────────────────────────────────
proc_name  = "ip-logger"
daemon     = False              # 컨테이너 환경에서는 반드시 False

# ── 보안 ─────────────────────────────────────────
limit_request_line   = 4094
limit_request_fields = 100
