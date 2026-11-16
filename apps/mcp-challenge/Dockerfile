FROM python:3.15-slim@sha256:65a65fc7b30b06cb6df4930fd4650697cb23f4c2698ab81fc87e4b031bc36928
WORKDIR /app
RUN useradd --create-home --uid 10001 appuser
COPY requirements.lock .
RUN pip install --no-cache-dir --require-hashes -r requirements.lock
COPY --chown=appuser:appuser . .
USER appuser
CMD ["python", "server.py"]
