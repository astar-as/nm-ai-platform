CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE auth_provider AS ENUM ('google', 'magic', 'mock');
CREATE TYPE team_role AS ENUM ('captain', 'member');
CREATE TYPE submission_mode AS ENUM ('endpoint', 'code');
CREATE TYPE submission_status AS ENUM (
    'uploading', 'queued', 'processing', 'scoring',
    'completed', 'failed', 'timeout'
);

CREATE TABLE competitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(50) UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    name VARCHAR(255) NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT false,
    leaderboard_revealed BOOLEAN NOT NULL DEFAULT false,
    max_team_size SMALLINT NOT NULL DEFAULT 4 CHECK (max_team_size BETWEEN 1 AND 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (ends_at > starts_at)
);

CREATE UNIQUE INDEX competitions_one_active
    ON competitions (is_active) WHERE is_active;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL CHECK (email = LOWER(email)),
    name VARCHAR(255) NOT NULL DEFAULT '',
    avatar_url TEXT,
    auth_provider auth_provider NOT NULL,
    auth_provider_id VARCHAR(255) NOT NULL,
    occupation VARCHAR(100),
    github_username VARCHAR(100),
    linkedin_url VARCHAR(255),
    x_username VARCHAR(100),
    is_admin BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (auth_provider, auth_provider_id)
);

CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    invite_code VARCHAR(20) UNIQUE NOT NULL
        DEFAULT UPPER(ENCODE(gen_random_bytes(8), 'hex')),
    roster_locked_at TIMESTAMPTZ,
    last_eval_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (competition_id, slug)
);

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    slug VARCHAR(50) NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    submission_mode submission_mode NOT NULL,
    endpoint_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
    scoring_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    max_response_time_ms INTEGER NOT NULL DEFAULT 30000
        CHECK (max_response_time_ms BETWEEN 100 AND 3600000),
    is_active BOOLEAN NOT NULL DEFAULT false,
    reveals_at TIMESTAMPTZ,
    opens_at TIMESTAMPTZ,
    closes_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (competition_id, slug),
    CHECK (closes_at IS NULL OR opens_at IS NULL OR closes_at > opens_at)
);

CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role team_role NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (team_id, user_id)
);

CREATE UNIQUE INDEX team_one_captain
    ON team_members (team_id) WHERE role = 'captain';

CREATE TABLE submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    submission_type submission_mode NOT NULL,
    endpoint_url TEXT,
    endpoint_api_key TEXT,
    artifact_path TEXT,
    upload_size_bytes BIGINT CHECK (upload_size_bytes IS NULL OR upload_size_bytes >= 0),
    status submission_status NOT NULL DEFAULT 'queued',
    queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID NOT NULL REFERENCES users(id),
    locked_by VARCHAR(255),
    locked_at TIMESTAMPTZ,
    lease_expires_at TIMESTAMPTZ,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    last_error TEXT,
    error_type VARCHAR(20) CHECK (
        error_type IS NULL OR error_type IN (
            'infrastructure', 'timeout', 'cancelled', 'security',
            'validation', 'output', 'execution', 'runtime'
        )
    ),
    CHECK (
        (submission_type = 'endpoint' AND endpoint_url IS NOT NULL AND artifact_path IS NULL)
        OR
        (submission_type = 'code' AND endpoint_url IS NULL)
    ),
    CHECK (endpoint_api_key IS NULL OR endpoint_api_key LIKE 'enc:v1:%')
);

CREATE TABLE evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID UNIQUE NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    score NUMERIC(20, 8),
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    raw_response JSONB,
    duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
    error_message TEXT,
    http_status INTEGER CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
    scoring_version VARCHAR(50),
    sandbox_exit_code INTEGER,
    execution_logs TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (score IS NULL OR score::text NOT IN ('NaN', 'Infinity', '-Infinity'))
);

CREATE TABLE leaderboard_scores (
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    best_score NUMERIC(20, 8),
    best_submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
    selected_submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
    total_submissions INTEGER NOT NULL DEFAULT 0,
    last_submission_at TIMESTAMPTZ,
    PRIMARY KEY (team_id, task_id)
);

CREATE TABLE test_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    s3_key VARCHAR(512) NOT NULL,
    case_count INTEGER NOT NULL CHECK (case_count >= 0),
    checksum VARCHAR(128),
    is_active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (task_id, name)
);

CREATE TABLE oauth_states (
    state VARCHAR(128) PRIMARY KEY,
    code_verifier VARCHAR(128) NOT NULL,
    code_challenge VARCHAR(128) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    redirect_uri TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes')
);

CREATE TABLE magic_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL CHECK (email = LOWER(email)),
    token_hash CHAR(64) UNIQUE NOT NULL,
    request_ip VARCHAR(64),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE api_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(80) NOT NULL,
    token_hash CHAR(64) UNIQUE NOT NULL,
    token_hint VARCHAR(24) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE team_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL CHECK (email = LOWER(email)),
    token_hash CHAR(64) UNIQUE NOT NULL,
    invited_by UUID NOT NULL REFERENCES users(id),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rate_limit_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    scope VARCHAR(64) NOT NULL,
    key_hash CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    address TEXT NOT NULL,
    description TEXT NOT NULL,
    detailed_description TEXT,
    google_maps_url TEXT,
    latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    opening_hours JSONB,
    image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE location_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    detailed_description TEXT,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    event_type VARCHAR(50) NOT NULL DEFAULT 'other',
    is_featured BOOLEAN NOT NULL DEFAULT false,
    registration_url TEXT,
    cover_url TEXT,
    is_free BOOLEAN NOT NULL DEFAULT true,
    capacity INTEGER CHECK (capacity IS NULL OR capacity >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (ends_at > starts_at),
    CHECK (registration_url IS NULL OR registration_url LIKE 'https://%'),
    CHECK (cover_url IS NULL OR cover_url LIKE 'https://%')
);

CREATE TABLE task_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    slug VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    unlocks_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (task_id, slug)
);

CREATE TABLE leaderboard_scores_by_category (
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    category_slug VARCHAR(100) NOT NULL,
    best_score NUMERIC(20, 8),
    best_submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
    total_submissions INTEGER NOT NULL DEFAULT 0,
    last_submission_at TIMESTAMPTZ,
    PRIMARY KEY (team_id, task_id, category_slug),
    FOREIGN KEY (task_id, category_slug)
        REFERENCES task_categories(task_id, slug) ON DELETE CASCADE
);

CREATE TABLE private_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    public_score NUMERIC(20, 8) NOT NULL,
    private_score NUMERIC(20, 8) NOT NULL,
    private_category_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
    private_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    evaluation_round INTEGER NOT NULL CHECK (evaluation_round > 0),
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (team_id, task_id, evaluation_round)
);

CREATE TABLE batch_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    job_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    result JSONB NOT NULL DEFAULT '{}'::jsonb,
    error TEXT,
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    locked_by VARCHAR(100),
    lease_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE code_scan_results (
    submission_id UUID PRIMARY KEY REFERENCES submissions(id) ON DELETE CASCADE,
    scan_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    file_count INTEGER,
    total_size_bytes BIGINT,
    has_entrypoint BOOLEAN NOT NULL DEFAULT false,
    flagged_imports TEXT[],
    flagged_files TEXT[],
    scan_errors TEXT[],
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE team_bans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    reason TEXT CHECK (length(reason) <= 500),
    banned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    banned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (team_id, task_id)
);

CREATE TABLE user_bans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    banned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    banned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ban_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
    verdict VARCHAR(20) NOT NULL CHECK (
        verdict IN ('auto_unbanned', 'recommended_unban', 'kept_banned')
    ),
    review_reason TEXT,
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (team_id, task_id)
);

CREATE TABLE final_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    submitted_by UUID NOT NULL REFERENCES users(id),
    links JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (team_id, competition_id)
);

CREATE TABLE certificate_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_code VARCHAR(20) UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id),
    team_id UUID NOT NULL REFERENCES teams(id),
    competition_id UUID NOT NULL REFERENCES competitions(id),
    participant_name TEXT NOT NULL,
    team_name TEXT NOT NULL,
    overall_rank INTEGER,
    task_placements JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, competition_id)
);

CREATE TABLE feedback_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, competition_id)
);

CREATE INDEX users_auth_idx ON users (auth_provider, auth_provider_id);
CREATE INDEX teams_competition_idx ON teams (competition_id) WHERE deleted_at IS NULL;
CREATE INDEX team_members_user_idx ON team_members (user_id);
CREATE INDEX tasks_competition_idx ON tasks (competition_id, is_active, reveals_at);
CREATE INDEX submissions_team_task_idx ON submissions (team_id, task_id, queued_at DESC);
CREATE INDEX submissions_claim_idx ON submissions (task_id, status, queued_at)
    WHERE status IN ('queued', 'processing');
CREATE INDEX submissions_lease_idx ON submissions (lease_expires_at)
    WHERE status = 'processing';
CREATE INDEX evaluations_score_idx ON evaluations (score);
CREATE INDEX leaderboard_task_score_idx ON leaderboard_scores (task_id, best_score);
CREATE INDEX test_sets_active_idx ON test_sets (task_id) WHERE is_active;
CREATE INDEX oauth_states_expiry_idx ON oauth_states (expires_at);
CREATE INDEX magic_tokens_expiry_idx ON magic_tokens (expires_at);
CREATE INDEX api_tokens_user_idx ON api_tokens (user_id, revoked_at, expires_at);
CREATE INDEX team_invitations_team_idx ON team_invitations (team_id, expires_at);
CREATE INDEX rate_limit_events_lookup_idx
    ON rate_limit_events (scope, key_hash, created_at DESC);
CREATE INDEX location_events_time_idx ON location_events (starts_at);
CREATE INDEX category_leaderboard_idx
    ON leaderboard_scores_by_category (task_id, category_slug, best_score);
CREATE INDEX private_evaluations_task_idx
    ON private_evaluations (task_id, evaluation_round, private_score);
CREATE INDEX batch_jobs_pending_idx ON batch_jobs (job_type, status)
    WHERE status IN ('pending', 'running');
CREATE INDEX feedback_competition_idx ON feedback_submissions (competition_id);

CREATE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER competitions_touch BEFORE UPDATE ON competitions
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER users_touch BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER teams_touch BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER tasks_touch BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER final_submissions_touch BEFORE UPDATE ON final_submissions
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER feedback_submissions_touch BEFORE UPDATE ON feedback_submissions
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE FUNCTION enforce_team_membership() RETURNS TRIGGER AS $$
DECLARE
    target_competition UUID;
    team_limit INTEGER;
    team_locked_at TIMESTAMPTZ;
BEGIN
    SELECT t.competition_id, c.max_team_size, t.roster_locked_at
    INTO target_competition, team_limit, team_locked_at
    FROM teams t JOIN competitions c ON c.id = t.competition_id
    WHERE t.id = NEW.team_id AND t.deleted_at IS NULL
    FOR UPDATE OF t;

    IF target_competition IS NULL THEN
        RAISE EXCEPTION 'Team is unavailable';
    END IF;
    IF team_locked_at IS NOT NULL THEN
        RAISE EXCEPTION 'Team roster is locked after first submission';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtext('membership:' || target_competition::text || ':' || NEW.user_id::text)
    );

    IF EXISTS (
        SELECT 1 FROM team_members tm
        JOIN teams existing_team ON existing_team.id = tm.team_id
        WHERE tm.user_id = NEW.user_id
          AND existing_team.competition_id = target_competition
          AND existing_team.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'User is already in a team for this competition';
    END IF;

    IF (SELECT COUNT(*) FROM team_members WHERE team_id = NEW.team_id) >= team_limit THEN
        RAISE EXCEPTION 'Team member limit reached';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER team_membership_guard BEFORE INSERT ON team_members
    FOR EACH ROW EXECUTE FUNCTION enforce_team_membership();

CREATE FUNCTION validate_submission_scope() RETURNS TRIGGER AS $$
DECLARE
    task_competition UUID;
    team_competition UUID;
    task_mode submission_mode;
BEGIN
    SELECT competition_id, submission_mode
    INTO task_competition, task_mode
    FROM tasks WHERE id = NEW.task_id;

    SELECT competition_id INTO team_competition
    FROM teams WHERE id = NEW.team_id AND deleted_at IS NULL;

    IF task_competition IS NULL OR team_competition IS NULL
       OR task_competition <> team_competition THEN
        RAISE EXCEPTION 'Submission team and task must belong to the same competition';
    END IF;
    IF NEW.submission_type <> task_mode THEN
        RAISE EXCEPTION 'Submission type does not match task submission mode';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM team_members
        WHERE team_id = NEW.team_id AND user_id = NEW.created_by
    ) THEN
        RAISE EXCEPTION 'Submission creator must be a member of the submitting team';
    END IF;
    IF NEW.submission_type = 'code'
       AND NEW.status IN ('queued', 'processing', 'scoring', 'completed')
       AND NEW.artifact_path IS NULL THEN
        RAISE EXCEPTION 'Queued code submissions require an artifact';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER submission_scope_guard BEFORE INSERT OR UPDATE ON submissions
    FOR EACH ROW EXECUTE FUNCTION validate_submission_scope();

CREATE FUNCTION validate_leaderboard_scope() RETURNS TRIGGER AS $$
DECLARE
    task_competition UUID;
    team_competition UUID;
BEGIN
    SELECT competition_id INTO task_competition FROM tasks WHERE id = NEW.task_id;
    SELECT competition_id INTO team_competition
    FROM teams WHERE id = NEW.team_id AND deleted_at IS NULL;
    IF task_competition IS NULL OR team_competition IS NULL
       OR task_competition <> team_competition THEN
        RAISE EXCEPTION 'Leaderboard team and task must belong to the same competition';
    END IF;
    IF NEW.best_submission_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM submissions
        WHERE id = NEW.best_submission_id
          AND team_id = NEW.team_id AND task_id = NEW.task_id
    ) THEN
        RAISE EXCEPTION 'Best submission must belong to the leaderboard team and task';
    END IF;
    IF NEW.selected_submission_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM submissions
        WHERE id = NEW.selected_submission_id
          AND team_id = NEW.team_id AND task_id = NEW.task_id
          AND status = 'completed'
    ) THEN
        RAISE EXCEPTION 'Selected submission must be a completed submission for the leaderboard team and task';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leaderboard_scope_guard BEFORE INSERT OR UPDATE ON leaderboard_scores
    FOR EACH ROW EXECUTE FUNCTION validate_leaderboard_scope();

CREATE FUNCTION validate_team_task_scope() RETURNS TRIGGER AS $$
DECLARE
    task_competition UUID;
    team_competition UUID;
BEGIN
    SELECT competition_id INTO task_competition FROM tasks WHERE id = NEW.task_id;
    SELECT competition_id INTO team_competition
    FROM teams WHERE id = NEW.team_id AND deleted_at IS NULL;
    IF task_competition IS NULL OR team_competition IS NULL
       OR task_competition <> team_competition THEN
        RAISE EXCEPTION 'Team and task must belong to the same competition';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER category_leaderboard_scope_guard
    BEFORE INSERT OR UPDATE ON leaderboard_scores_by_category
    FOR EACH ROW EXECUTE FUNCTION validate_team_task_scope();
CREATE TRIGGER team_ban_scope_guard BEFORE INSERT OR UPDATE ON team_bans
    FOR EACH ROW EXECUTE FUNCTION validate_team_task_scope();
CREATE TRIGGER ban_review_scope_guard BEFORE INSERT OR UPDATE ON ban_reviews
    FOR EACH ROW EXECUTE FUNCTION validate_team_task_scope();

CREATE FUNCTION validate_private_evaluation_scope() RETURNS TRIGGER AS $$
DECLARE
    task_competition UUID;
    team_competition UUID;
BEGIN
    SELECT competition_id INTO task_competition FROM tasks WHERE id = NEW.task_id;
    SELECT competition_id INTO team_competition
    FROM teams WHERE id = NEW.team_id AND deleted_at IS NULL;
    IF task_competition IS NULL OR team_competition IS NULL
       OR task_competition <> team_competition THEN
        RAISE EXCEPTION 'Team and task must belong to the same competition';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM submissions
        WHERE id = NEW.submission_id
          AND team_id = NEW.team_id AND task_id = NEW.task_id
          AND status = 'completed'
    ) THEN
        RAISE EXCEPTION 'Private evaluation submission must match its team and task';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER private_evaluation_scope_guard
    BEFORE INSERT OR UPDATE ON private_evaluations
    FOR EACH ROW EXECUTE FUNCTION validate_private_evaluation_scope();

CREATE FUNCTION validate_competition_record_scope() RETURNS TRIGGER AS $$
DECLARE
    team_competition UUID;
BEGIN
    SELECT competition_id INTO team_competition
    FROM teams WHERE id = NEW.team_id AND deleted_at IS NULL;
    IF team_competition IS NULL OR team_competition <> NEW.competition_id THEN
        RAISE EXCEPTION 'Team and record must belong to the same competition';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER final_submission_scope_guard
    BEFORE INSERT OR UPDATE ON final_submissions
    FOR EACH ROW EXECUTE FUNCTION validate_competition_record_scope();
CREATE TRIGGER certificate_scope_guard
    BEFORE INSERT OR UPDATE ON certificate_records
    FOR EACH ROW EXECUTE FUNCTION validate_competition_record_scope();

CREATE FUNCTION lock_team_roster() RETURNS TRIGGER AS $$
BEGIN
    UPDATE teams SET roster_locked_at = COALESCE(roster_locked_at, NOW())
    WHERE id = NEW.team_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lock_roster_on_submission AFTER INSERT ON submissions
    FOR EACH ROW EXECUTE FUNCTION lock_team_roster();

CREATE FUNCTION enforce_roster_lock() RETURNS TRIGGER AS $$
DECLARE
    locked_at TIMESTAMPTZ;
BEGIN
    SELECT roster_locked_at INTO locked_at FROM teams WHERE id = OLD.team_id FOR UPDATE;
    IF locked_at IS NOT NULL THEN
        RAISE EXCEPTION 'Team roster is locked after first submission';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER team_roster_mutation_guard BEFORE UPDATE OR DELETE ON team_members
    FOR EACH ROW EXECUTE FUNCTION enforce_roster_lock();

CREATE FUNCTION update_leaderboard_score() RETURNS TRIGGER AS $$
DECLARE
    participant_team UUID;
    scored_task UUID;
    direction TEXT;
    best_id UUID;
    best_value NUMERIC(20, 8);
    submission_count INTEGER;
    latest_submission TIMESTAMPTZ;
BEGIN
    SELECT s.team_id, s.task_id,
           COALESCE(t.scoring_config->>'score_direction', 'maximize')
    INTO participant_team, scored_task, direction
    FROM submissions s JOIN tasks t ON t.id = s.task_id
    WHERE s.id = NEW.submission_id;

    IF NEW.score IS NULL THEN
        RETURN NEW;
    END IF;

    IF direction = 'minimize' THEN
        SELECT e.submission_id, e.score
        INTO best_id, best_value
        FROM evaluations e JOIN submissions s ON s.id = e.submission_id
        WHERE s.team_id = participant_team AND s.task_id = scored_task
          AND e.score IS NOT NULL
        ORDER BY e.score ASC, e.created_at ASC
        LIMIT 1;
    ELSE
        SELECT e.submission_id, e.score
        INTO best_id, best_value
        FROM evaluations e JOIN submissions s ON s.id = e.submission_id
        WHERE s.team_id = participant_team AND s.task_id = scored_task
          AND e.score IS NOT NULL
        ORDER BY e.score DESC, e.created_at ASC
        LIMIT 1;
    END IF;

    SELECT COUNT(*), MAX(s.queued_at)
    INTO submission_count, latest_submission
    FROM evaluations e JOIN submissions s ON s.id = e.submission_id
    WHERE s.team_id = participant_team AND s.task_id = scored_task;

    INSERT INTO leaderboard_scores (
        team_id, task_id, best_score, best_submission_id,
        total_submissions, last_submission_at
    ) VALUES (
        participant_team, scored_task, best_value, best_id,
        submission_count, latest_submission
    )
    ON CONFLICT (team_id, task_id) DO UPDATE SET
        best_score = EXCLUDED.best_score,
        best_submission_id = EXCLUDED.best_submission_id,
        total_submissions = EXCLUDED.total_submissions,
        last_submission_at = EXCLUDED.last_submission_at;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leaderboard_after_evaluation AFTER INSERT ON evaluations
    FOR EACH ROW EXECUTE FUNCTION update_leaderboard_score();
