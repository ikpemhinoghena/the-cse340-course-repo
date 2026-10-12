-- Additive migration: run against an existing database after Week 5 setup.
BEGIN;

CREATE TABLE IF NOT EXISTS public.project_volunteer (
    user_id INTEGER NOT NULL,
    project_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, project_id),
    CONSTRAINT fk_project_volunteer_user
        FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_project_volunteer_project
        FOREIGN KEY (project_id) REFERENCES public.service_project(project_id) ON DELETE CASCADE
);

COMMIT;
