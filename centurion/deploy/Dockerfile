# Centurion container — multi-stage so the polished React dashboard is built
# and served with zero manual steps. Stage 1 builds the UI; stage 2 runs Python.
FROM node:20-slim AS web
WORKDIR /web
COPY dashboard/web/package.json dashboard/web/package-lock.json* ./
RUN npm install
COPY dashboard/web/ ./
RUN npm run build

FROM python:3.11-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
# Drop the built dashboard in where Flask serves it from.
COPY --from=web /web/dist ./dashboard/web/dist

# Default: initialize (idempotent) then run the daemon.
CMD ["sh", "-c", "python main.py --init || true; python main.py run"]
