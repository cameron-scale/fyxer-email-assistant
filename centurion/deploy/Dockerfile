# Centurion container. Runs the orchestrator daemon; the dashboard and watchdog
# run as sibling services in docker-compose.
FROM python:3.11-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Default: initialize (idempotent) then run the daemon.
CMD ["sh", "-c", "python main.py --init || true; python main.py run"]
