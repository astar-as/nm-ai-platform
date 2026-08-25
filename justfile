set dotenv-load
set shell := ["bash", "-euo", "pipefail", "-c"]
set unstable

# ---------------------------------------------------------------------------- #
#                                 DEPENDENCIES                                 #
# ---------------------------------------------------------------------------- #

python3 := "python3"
pnpm := "pnpm"
psql := "psql"

# ---------------------------------------------------------------------------- #
#                                  CONSTANTS                                   #
# ---------------------------------------------------------------------------- #

db_host := env_var_or_default("DB_HOST", "localhost")
db_port := env_var_or_default("DB_PORT", env_var_or_default("POSTGRES_PORT", "55432"))
db_name := env_var_or_default("DB_NAME", "championship")
db_user := env_var_or_default("DB_USER", "postgres")
db_pass := env_var_or_default("DB_PASS", env_var_or_default("POSTGRES_PASSWORD", "postgres"))
db_url := "postgresql://" + db_user + ":" + db_pass + "@" + db_host + ":" + db_port + "/" + db_name
export DATABASE_URL := env_var_or_default("DATABASE_URL", db_url)
export NEXT_PUBLIC_ALLOW_MOCK_AUTH := env_var_or_default("ALLOW_MOCK_AUTH", "false")

# ---------------------------------------------------------------------------- #
#                                   COMMANDS                                   #
# ---------------------------------------------------------------------------- #

default:
    @just --list

# ---------------------------------------------------------------------------- #
#                                    META                                      #
# ---------------------------------------------------------------------------- #

[private]
@ensure-env:
    if [ ! -f .env ]; then cp .env.example .env; echo "Created .env from .env.example"; fi

[group("meta")]
install: ensure-env backend-install frontend-install validators-install mcp-challenge-install mcp-submit-install
alias i := install

[group("meta")]
@dev: ensure-env
    python3 scripts/dev_banner.py "${DEV_BANNER:-${NEXT_PUBLIC_APP_NAME:-AI Championship}}"
    (cd apps/backend && .venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8003) & \
    backend_pid=$!; \
    trap 'kill "$backend_pid" 2>/dev/null || true' EXIT INT TERM; \
    cd apps/frontend && pnpm dev --hostname localhost --port 3003

# ---------------------------------------------------------------------------- #
#                                   BACKEND                                    #
# ---------------------------------------------------------------------------- #

[group("backend")]
@backend-install:
    cd apps/backend && \
    python3 -m venv .venv && \
    .venv/bin/python -m pip install --upgrade pip && \
    .venv/bin/python -m pip install --require-hashes -r requirements-dev.lock
alias bi := backend-install

[group("backend")]
@backend-dev:
    cd apps/backend && \
    .venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8003
alias bd := backend-dev
alias b := backend-dev

# ---------------------------------------------------------------------------- #
#                                   FRONTEND                                   #
# ---------------------------------------------------------------------------- #

[group("frontend")]
@frontend-install:
    cd apps/frontend && pnpm install
alias fi := frontend-install

[group("frontend")]
@frontend-dev:
    cd apps/frontend && pnpm dev --hostname localhost --port 3003
alias fd := frontend-dev
alias f := frontend-dev

# ---------------------------------------------------------------------------- #
#                                  VALIDATORS                                  #
# ---------------------------------------------------------------------------- #

# Install validator shared harness + template
[group("validator")]
validators-install: validator-shared-install validator-template-install
alias vi := validators-install

[group("validator")]
@validator-shared-install:
    cd apps/validators/shared && \
    python3 -m venv .venv && \
    .venv/bin/python -m pip install --upgrade pip && \
    .venv/bin/python -m pip install --require-hashes -r requirements.lock

[group("validator")]
@validator-template-install:
    cd apps/validators && \
    python3 -m venv validator-template/.venv && \
    validator-template/.venv/bin/python -m pip install --upgrade pip && \
    validator-template/.venv/bin/python -m pip install --require-hashes -r shared/requirements.lock && \
    validator-template/.venv/bin/python -m pip install -r validator-template/requirements.txt
alias vti := validator-template-install

[group("validator")]
@validator-template:
    cd apps/validators && \
    validator-template/.venv/bin/python validator-template/main.py
alias vt := validator-template

# ---------------------------------------------------------------------------- #
#                               MCP CHALLENGE                                  #
# ---------------------------------------------------------------------------- #

[group("mcp-challenge")]
@mcp-challenge-install:
    cd apps/mcp-challenge && \
    python3 -m venv .venv && \
    .venv/bin/python -m pip install --upgrade pip && \
    .venv/bin/python -m pip install --require-hashes -r requirements.lock
alias mci := mcp-challenge-install

[group("mcp-challenge")]
@mcp-challenge-dev *args:
    cd apps/mcp-challenge && \
    .venv/bin/python server.py {{args}}
alias mcd := mcp-challenge-dev

# ---------------------------------------------------------------------------- #
#                                 MCP SUBMIT                                   #
# ---------------------------------------------------------------------------- #

[group("mcp-submit")]
@mcp-submit-install:
    cd apps/mcp-submit && \
    python3 -m venv .venv && \
    .venv/bin/python -m pip install --upgrade pip && \
    .venv/bin/python -m pip install --require-hashes -r requirements.lock
alias msi := mcp-submit-install

[group("mcp-submit")]
@mcp-submit-dev *args:
    cd apps/mcp-submit && \
    .venv/bin/python server.py {{args}}
alias msd := mcp-submit-dev

# ---------------------------------------------------------------------------- #
#                                   DATABASE                                   #
# ---------------------------------------------------------------------------- #

# Suppress perl locale warnings and PostgreSQL NOTICE messages
export PERL_BADLANG := "0"
export PGOPTIONS := "--client-min-messages=warning"

[group("database")]
[script("bash")]
migrate: ensure-env
    bash scripts/migrate.sh
alias m := migrate

[group("database")]
@migrate-fresh: db-reset migrate

[group("database")]
@db-reset:
    docker compose down --volumes

[group("database")]
@db-shell: ensure-env
    docker compose up -d postgres
    docker compose exec postgres psql -U postgres -d championship

# ---------------------------------------------------------------------------- #
#                                    TESTS                                     #
# ---------------------------------------------------------------------------- #

[group("test")]
@test-backend:
    cd apps/backend && .venv/bin/python -m pytest tests/ -v

[group("test")]
test: test-backend test-frontend

[group("test")]
@test-frontend:
    cd apps/frontend && pnpm lint && pnpm build
