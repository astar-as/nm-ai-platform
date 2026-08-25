FROM python:3.13-slim@sha256:ffb752e139c0a19692a43af8d8523b274222dd68eebad5d583b45c2201c6e30a
WORKDIR /app
RUN useradd --create-home --uid 10001 appuser
COPY requirements.lock .
RUN pip install --no-cache-dir --require-hashes -r requirements.lock
COPY --chown=appuser:appuser . .
USER appuser
CMD ["python", "server.py", "--http", "--port", "8080"]
