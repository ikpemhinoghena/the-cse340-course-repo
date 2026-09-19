import db from './db.js'

const getAllCategories = async() => {
const query = `SELECT category_id, name
        FROM public.category;
    `;
const result = await db.query(query);

return result.rows;
}

const getCategoryDetails = async (id) => {
const query = `SELECT category_id, name
        FROM public.category
        WHERE category_id = $1;
    `;
const queryParams = [id];
const result = await db.query(query, queryParams);

return result.rows.length > 0 ? result.rows[0] : null;
};

const getCategoriesByProjectId = async (projectId) => {
const query = `SELECT category.category_id, category.name
        FROM public.project_category
        INNER JOIN public.category
        ON project_category.category_id = category.category_id
        WHERE project_category.project_id = $1
        ORDER BY category.name;
    `;
const queryParams = [projectId];
const result = await db.query(query, queryParams);

return result.rows;
};

const getProjectsByCategoryId = async (categoryId) => {
const query = `SELECT service_project.project_id, service_project.title
        FROM public.project_category
        INNER JOIN public.service_project
        ON project_category.project_id = service_project.project_id
        WHERE project_category.category_id = $1
        ORDER BY service_project.date;
    `;
const queryParams = [categoryId];
const result = await db.query(query, queryParams);

return result.rows;
};

export {getAllCategories, getCategoryDetails, getCategoriesByProjectId, getProjectsByCategoryId}
