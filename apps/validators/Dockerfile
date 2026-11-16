FROM python:3.15-slim@sha256:65a65fc7b30b06cb6df4930fd4650697cb23f4c2698ab81fc87e4b031bc36928

WORKDIR /app
RUN useradd --create-home --uid 10001 appuser

COPY shared/requirements.lock shared-requirements.lock
COPY validator-template/requirements.txt validator-requirements.txt
RUN pip install --no-cache-dir --require-hashes -r shared-requirements.lock && \
    pip install --no-cache-dir --require-hashes -r validator-requirements.txt

COPY --chown=appuser:appuser shared/ shared/
COPY --chown=appuser:appuser validator-template/ validator-template/

USER appuser

EXPOSE 8080

CMD ["python", "validator-template/main.py"]
