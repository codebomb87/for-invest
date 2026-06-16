# Dockerfile

FROM python:3.12-slim

WORKDIR /app

# 의존성 설치 (캐시 레이어 분리)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

# 소스 복사
COPY . .

# 로그 디렉토리 생성
RUN mkdir -p /app/logs

# 환경변수 기본값
ENV LOG_DIR=/app/logs \
    ADMIN_TOKEN=change-me \
    TRUST_PROXY=true \
    LOG_LEVEL=info

EXPOSE 5000

# Gunicorn으로 실행
CMD ["gunicorn", "-c", "gunicorn.conf.py", "server:app"]
