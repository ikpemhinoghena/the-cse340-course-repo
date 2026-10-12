-- Read-only verification; does not insert, update, or delete any records.
BEGIN READ ONLY;

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.project_volunteer'::regclass
ORDER BY conname;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.project_volunteer'::regclass
          AND contype = 'p'
          AND pg_get_constraintdef(oid) = 'PRIMARY KEY (user_id, project_id)'
    ) THEN
        RAISE EXCEPTION 'Missing volunteer composite primary key';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.project_volunteer'::regclass
          AND contype = 'f' AND confdeltype = 'c'
          AND confrelid = 'public.users'::regclass
          AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (user_id) REFERENCES %users(user_id) ON DELETE CASCADE'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.project_volunteer'::regclass
          AND contype = 'f' AND confdeltype = 'c'
          AND confrelid = 'public.service_project'::regclass
          AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (project_id) REFERENCES %service_project(project_id) ON DELETE CASCADE'
    ) THEN
        RAISE EXCEPTION 'Missing volunteer foreign keys with cascading deletes';
    END IF;
END;
$$;

ROLLBACK;
