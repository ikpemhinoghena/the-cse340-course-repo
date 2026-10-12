import { getUpcomingProjects, getProjectDetails, createProject, updateProject } from '../models/projects.js';
import { getCategoriesByProjectId } from '../models/categories.js';
import { getAllOrganizations } from '../models/organizations.js';
import { body, validationResult } from 'express-validator';
import { addVolunteer, removeVolunteer, isVolunteer } from '../models/volunteers.js';

const validateVolunteerProjectId = (req, res, next) => {
    const id = req.params.id;
    if (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647) {
        return res.status(400).send('Invalid project ID.');
    }
    next();
};

const requireProject = async (projectId) => {
    const project = await getProjectDetails(projectId);
    if (!project) {
        const error = new Error('Project not found');
        error.status = 404;
        throw error;
    }
    return project;
};

const processVolunteerSignup = async (req, res) => {
    const projectId = req.params.id;
    await requireProject(projectId);
    const added = await addVolunteer(req.session.user.user_id, projectId);
    req.flash(added ? 'success' : 'info', added
        ? 'You have volunteered for this project!' : 'You are already volunteering for this project.');
    res.redirect(`/project/${projectId}`);
};

const processVolunteerRemoval = async (req, res) => {
    const projectId = req.params.id;
    await requireProject(projectId);
    const removed = await removeVolunteer(req.session.user.user_id, projectId);
    req.flash(removed ? 'success' : 'info', removed
        ? 'Your volunteer signup has been removed.' : 'You are not volunteering for this project.');
    res.redirect('/dashboard');
};

const projectValidation = [
    body('title')
        .trim()
        .notEmpty().withMessage('Title is required')
        .isLength({ min: 3, max: 200 }).withMessage('Title must be between 3 and 200 characters'),
    body('description')
        .trim()
        .notEmpty().withMessage('Description is required')
        .isLength({ max: 1000 }).withMessage('Description must be less than 1000 characters'),
    body('location')
        .trim()
        .notEmpty().withMessage('Location is required')
        .isLength({ max: 200 }).withMessage('Location must be less than 200 characters'),
    body('date')
        .notEmpty().withMessage('Date is required')
        .isISO8601().withMessage('Date must be a valid date format'),
    body('organizationId')
        .notEmpty().withMessage('Organization is required')
        .isInt().withMessage('Organization must be a valid integer')
];

const NUMBER_OF_UPCOMING_PROJECTS = 5;

const showProjectsPage = async (req, res) => {
    const projects = await getUpcomingProjects(NUMBER_OF_UPCOMING_PROJECTS);
    const title = 'Upcoming Service Projects';
    res.render('projects', { title, projects });
};

const showProjectDetailsPage = async (req, res) => {
    const projectId = req.params.id;
    const project = await requireProject(projectId);
    const categories = await getCategoriesByProjectId(projectId);
    const volunteered = req.session?.user
        ? await isVolunteer(req.session.user.user_id, projectId) : false;
    const title = 'Service Project Details';
    res.render('project', { title, project, categories, volunteered });
};

const showNewProjectForm = async (req, res) => {
    const organizations = await getAllOrganizations();
    const title = 'Add New Service Project';

    res.render('new-project', { title, organizations });
};

const processNewProjectForm = async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        // Loop through validation errors and flash them
        errors.array().forEach((error) => {
            req.flash('error', error.msg);
        });

        // Redirect back to the new project form
        return res.redirect('/new-project');
    }

    // Extract form data from req.body
    const { title, description, location, date, organizationId } = req.body;

    try {
        // Create the new project in the database
        const newProjectId = await createProject(
            title,
            description,
            location,
            date,
            organizationId
        );

        req.flash('success', 'New service project created successfully!');
        res.redirect(`/project/${newProjectId}`);
    } catch (error) {
        console.error('Error creating new project:', error);
        req.flash('error', 'There was an error creating the service project.');
        res.redirect('/new-project');
    }
};

const showEditProjectForm = async (req, res) => {
    const projectId = req.params.id;
    const projectDetails = await getProjectDetails(projectId);
    const organizations = await getAllOrganizations();
    const title = 'Edit Service Project';

    res.render('edit-project', { title, projectDetails, organizations });
};

const processEditProjectForm = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        errors.array().forEach((error) => {
            req.flash('error', error.msg);
        });
        return res.redirect('/edit-project/' + req.params.id);
    }

    const projectId = req.params.id;
    const { title, description, location, date, organizationId } = req.body;

    await updateProject(
        projectId,
        title,
        description,
        location,
        date,
        organizationId
    );

    req.flash('success', 'Service project updated successfully!');
    res.redirect(`/project/${projectId}`);
};

export { showProjectsPage, showProjectDetailsPage, showNewProjectForm, processNewProjectForm, projectValidation, showEditProjectForm, processEditProjectForm };
export { validateVolunteerProjectId, processVolunteerSignup, processVolunteerRemoval };
