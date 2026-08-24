FROM python:3.13-slim@sha256:ffb752e139c0a19692a43af8d8523b274222dd68eebad5d583b45c2201c6e30a

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
