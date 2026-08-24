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

db_host := env_var_or_default("DB_HOST", "postgres")
db_name := env_var_or_default("DB_NAME", "championship")
db_user := env_var_or_default("DB_USER", "postgres")
db_pass := env_var_or_default("DB_PASS", "postgres")
db_url := "postgresql://" + db_user + ":" + db_pass + "@" + db_host + ":5432/" + db_name

# ---------------------------------------------------------------------------- #
#                                   COMMANDS                                   #
# ---------------------------------------------------------------------------- #

default:
    @just --list

# ---------------------------------------------------------------------------- #
#                                    META                                      #
# ---------------------------------------------------------------------------- #

[group("meta")]
install: backend-install frontend-install validators-install mcp-challenge-install mcp-submit-install
alias i := install

[group("meta")]
@dev:
    (cd apps/backend && .venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8003) & \
    cd apps/frontend && pnpm dev --port 3003

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
    .venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8003
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
    cd apps/frontend && pnpm dev --port 3003
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
migrate:
    set -euo pipefail
    for f in $(ls apps/backend/migrations/*.sql | sort); do
        echo "Running $f..."
        psql -q "{{db_url}}" -f "$f"
    done
    echo "Migrations complete."
alias m := migrate

[group("database")]
@migrate-fresh: db-reset migrate

[group("database")]
@db-reset:
    psql -q "postgresql://{{db_user}}:{{db_pass}}@{{db_host}}:5432/postgres" -c "DROP DATABASE IF EXISTS {{db_name}}"
    psql -q "postgresql://{{db_user}}:{{db_pass}}@{{db_host}}:5432/postgres" -c "CREATE DATABASE {{db_name}}"

[group("database")]
@db-shell:
    psql "{{db_url}}"

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
