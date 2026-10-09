
BEGIN;

-- Display both seeded roles, then fail safely if either is missing.
SELECT role_id, role_name, role_description
FROM roles
WHERE role_name IN ('user', 'admin')
ORDER BY role_name;

DO $$
BEGIN
    IF (SELECT COUNT(*) FROM roles WHERE role_name IN ('user', 'admin')) <> 2 THEN
        RAISE EXCEPTION 'Verification requires both user and admin roles';
    END IF;
END;
$$;

-- Capture only the ID inserted by this run, so cleanup cannot target
-- a preexisting user. The temporary table is removed at transaction end.
CREATE TEMP TABLE week05_auth_test_user (
    user_id INTEGER PRIMARY KEY
) ON COMMIT DROP;

-- Resolve the foreign key by role name, without assuming numeric IDs.
-- This placeholder hash is only test data, never a login credential.
WITH inserted_user AS (
    INSERT INTO users (name, email, password_hash, role_id)
    SELECT 'Week 05 Temporary Auth Test',
           'week05-auth-verification-temp@example.invalid',
           'temporary-verification-placeholder-not-a-login-hash',
           role_id
    FROM roles
    WHERE role_name = 'user'
    RETURNING user_id
)
INSERT INTO week05_auth_test_user (user_id)
SELECT user_id FROM inserted_user;

-- Show the newly inserted user and its associated role.
SELECT u.user_id, u.name, u.email, r.role_id, r.role_name, r.role_description
FROM users AS u
JOIN roles AS r ON r.role_id = u.role_id
JOIN week05_auth_test_user AS t ON t.user_id = u.user_id;

-- Delete only the user inserted above, and display the removed ID/email.
DELETE FROM users AS u
USING week05_auth_test_user AS t
WHERE u.user_id = t.user_id
  AND u.email = 'week05-auth-verification-temp@example.invalid'
RETURNING u.user_id, u.email;

-- Leave no persistent test records, even if the script is rerun.
-- PostgreSQL SERIAL sequences can still advance during rolled-back inserts.
ROLLBACK;
