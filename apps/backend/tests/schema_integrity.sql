DO $$
DECLARE
    competition_a UUID;
    competition_b UUID;
    user_a UUID;
    user_b UUID;
    team_a UUID;
    team_b UUID;
    task_a UUID;
    task_b UUID;
BEGIN
    INSERT INTO competitions (slug, name, starts_at, ends_at, is_active)
    VALUES ('active', 'Active', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '1 hour', true)
    RETURNING id INTO competition_a;

    INSERT INTO competitions (slug, name, starts_at, ends_at)
    VALUES ('other', 'Other', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '1 hour')
    RETURNING id INTO competition_b;

    INSERT INTO users (email, name, auth_provider, auth_provider_id)
    VALUES ('one@example.com', 'One', 'magic', 'one@example.com') RETURNING id INTO user_a;
    INSERT INTO users (email, name, auth_provider, auth_provider_id)
    VALUES ('two@example.com', 'Two', 'magic', 'two@example.com') RETURNING id INTO user_b;

    INSERT INTO teams (competition_id, name, slug)
    VALUES (competition_a, 'One', 'one') RETURNING id INTO team_a;
    INSERT INTO teams (competition_id, name, slug)
    VALUES (competition_b, 'Two', 'two') RETURNING id INTO team_b;
    INSERT INTO team_members (team_id, user_id, role) VALUES (team_a, user_a, 'captain');
    INSERT INTO team_members (team_id, user_id, role) VALUES (team_b, user_b, 'captain');

    INSERT INTO tasks (competition_id, slug, name, submission_mode, is_active, scoring_config)
    VALUES (
        competition_a,
        'alpha',
        'Alpha',
        'endpoint',
        true,
        '{"normalization_min": 0, "normalization_max": 1}'
    ) RETURNING id INTO task_a;
    INSERT INTO tasks (competition_id, slug, name, submission_mode, is_active)
    VALUES (competition_b, 'beta', 'Beta', 'endpoint', true) RETURNING id INTO task_b;

    INSERT INTO submissions (team_id, task_id, submission_type, endpoint_url, created_by)
    VALUES (team_a, task_a, 'endpoint', 'https://example.com/', user_a);

    BEGIN
        INSERT INTO submissions (team_id, task_id, submission_type, endpoint_url, created_by)
        VALUES (team_a, task_a, 'endpoint', 'https://example.com/', user_b);
        RAISE EXCEPTION 'Cross-user submission was accepted';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Cross-user submission was accepted' THEN RAISE; END IF;
    END;

    BEGIN
        INSERT INTO submissions (team_id, task_id, submission_type, endpoint_url, created_by)
        VALUES (team_a, task_b, 'endpoint', 'https://example.com/', user_a);
        RAISE EXCEPTION 'Cross-competition submission was accepted';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Cross-competition submission was accepted' THEN RAISE; END IF;
    END;

    BEGIN
        INSERT INTO team_members (team_id, user_id, role) VALUES (team_a, user_b, 'member');
        RAISE EXCEPTION 'Locked roster mutation was accepted';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Locked roster mutation was accepted' THEN RAISE; END IF;
    END;

    BEGIN
        INSERT INTO team_bans (team_id, task_id, reason) VALUES (team_a, task_b, 'scope test');
        RAISE EXCEPTION 'Cross-competition ban was accepted';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Cross-competition ban was accepted' THEN RAISE; END IF;
    END;

    BEGIN
        INSERT INTO final_submissions (team_id, competition_id, submitted_by, links)
        VALUES (team_a, competition_b, user_a, '[]');
        RAISE EXCEPTION 'Cross-competition final record was accepted';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Cross-competition final record was accepted' THEN RAISE; END IF;
    END;
END
$$;
