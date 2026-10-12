import db from './db.js';

const addVolunteer = async (userId, projectId) => {
    const result = await db.query(`
        INSERT INTO public.project_volunteer (user_id, project_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, project_id) DO NOTHING
        RETURNING project_id;
    `, [userId, projectId]);
    return result.rows.length > 0;
};

const removeVolunteer = async (userId, projectId) => {
    const result = await db.query(`
        DELETE FROM public.project_volunteer
        WHERE user_id = $1 AND project_id = $2
        RETURNING project_id;
    `, [userId, projectId]);
    return result.rows.length > 0;
};

const isVolunteer = async (userId, projectId) => {
    const result = await db.query(`
        SELECT project_id FROM public.project_volunteer
        WHERE user_id = $1 AND project_id = $2;
    `, [userId, projectId]);
    return result.rows.length > 0;
};

const getVolunteeredProjects = async (userId) => {
    const result = await db.query(`
        SELECT p.project_id, p.title, p.date, p.location,
               o.name AS organization_name
        FROM public.project_volunteer AS v
        JOIN public.service_project AS p ON p.project_id = v.project_id
        JOIN public.organization AS o ON o.organization_id = p.organization_id
        WHERE v.user_id = $1
        ORDER BY p.date, p.title, p.project_id;
    `, [userId]);
    return result.rows;
};

export { addVolunteer, removeVolunteer, isVolunteer, getVolunteeredProjects };
