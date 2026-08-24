FROM python:3.14-slim@sha256:ce40764625a4ff50df3548277632e7f96c4e77fe75fa848aae9885476e7df5a4
WORKDIR /app
RUN useradd --create-home --uid 10001 appuser
COPY requirements.lock .
RUN pip install --no-cache-dir --require-hashes -r requirements.lock
COPY --chown=appuser:appuser . .
USER appuser
CMD ["python", "server.py"]
