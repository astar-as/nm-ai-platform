FROM python:3.14-slim@sha256:ce40764625a4ff50df3548277632e7f96c4e77fe75fa848aae9885476e7df5a4

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
