FROM python:3.11

WORKDIR /app

ENV POETRY_VIRTUALENVS_IN_PROJECT=1

COPY pyproject.toml poetry.lock ./
RUN pip install poetry && \
    poetry install --no-root --only main && \
    rm -rf ~/.cache/

COPY filestash_minio_oidc_auth filestash_minio_oidc_auth

EXPOSE 8000
ENTRYPOINT [ "poetry", "run", "python", "-m", "filestash_minio_oidc_auth" ]
