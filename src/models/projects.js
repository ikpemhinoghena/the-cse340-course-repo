import db from './db.js'

const getAllProjects = async() => {
const query = `SELECT service_project.project_id, service_project.organization_id,
        service_project.title, service_project.description, service_project.location,
        service_project.date, organization.name AS organization_name
        FROM public.service_project
        INNER JOIN public.organization
        ON service_project.organization_id = organization.organization_id;
    `;
const result = await db.query(query);

return result.rows;
}

const getProjectsByOrganizationId = async (organizationId) => {
const query = `SELECT project_id, organization_id, title, description, location, date
        FROM service_project
        WHERE organization_id = $1
        ORDER BY date;
    `;
const queryParams = [organizationId];
const result = await db.query(query, queryParams);

return result.rows;
};

const getUpcomingProjects = async (number_of_projects) => {
const query = `SELECT
        service_project.project_id,
        service_project.title,
        service_project.description,
        service_project.date,
        service_project.location,
        service_project.organization_id,
        organization.name AS organization_name
        FROM public.service_project
        INNER JOIN public.organization
        ON service_project.organization_id = organization.organization_id
        WHERE service_project.date >= CURRENT_DATE
        ORDER BY service_project.date ASC
        LIMIT $1;
    `;
const queryParams = [number_of_projects];
const result = await db.query(query, queryParams);

return result.rows;
};

const getProjectDetails = async (id) => {
const query = `SELECT
        service_project.project_id,
        service_project.title,
        service_project.description,
        service_project.date,
        service_project.location,
        service_project.organization_id,
        organization.name AS organization_name
        FROM public.service_project
        INNER JOIN public.organization
        ON service_project.organization_id = organization.organization_id
        WHERE service_project.project_id = $1;
    `;
const queryParams = [id];
const result = await db.query(query, queryParams);

return result.rows.length > 0 ? result.rows[0] : null;
};

export {getAllProjects, getProjectsByOrganizationId, getUpcomingProjects, getProjectDetails}
