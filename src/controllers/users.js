import bcrypt from 'bcrypt';
import { body, validationResult } from 'express-validator';
import { createUser, authenticateUser, getAllUsers } from '../models/users.js';

const userRegistrationValidation = [
    body('name')
        .isString().withMessage('Please provide a name.').bail()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Name must contain between 1 and 100 characters.'),
    body('email')
        .isString().withMessage('Please provide an email address.').bail()
        .trim().toLowerCase()
        .isLength({ max: 100 }).withMessage('Email cannot exceed 100 characters.')
        .isEmail().withMessage('Please provide a valid email address.'),
    body('password')
        .isString().withMessage('Please provide a password.').bail()
        .custom(password => password.trim().length > 0 && [...password].length >= 8)
        .withMessage('Password must contain at least 8 characters and cannot be blank.')
        .custom(password => Buffer.byteLength(password, 'utf8') <= 72)
        .withMessage('Password cannot exceed 72 bytes; some characters use multiple bytes.')
];

const showUserRegistrationForm = (req, res) => {
    res.render('register', { title: 'Register' });
};

const processUserRegistrationForm = async (req, res) => {
    const results = validationResult(req);
    if (!results.isEmpty()) {
        results.array().forEach(error => req.flash('error', error.msg));
        return res.redirect('/register');
    }

    const { name, email, password } = req.body;
    try {
        // Hash the original password without trimming or normalizing it.
        const passwordHash = await bcrypt.hash(password, 10);
        await createUser(name, email, passwordHash);
        req.flash('success', 'Registration successful! Please log in.');
        return res.redirect('/');
    } catch (error) {
        req.flash('error', error.code === '23505'
            ? 'An account with that email already exists.'
            : 'Unable to register right now. Please try again.');
        return res.redirect('/register');
    }
};

const showLoginForm = (req, res) => {
    // This GET has a new session after logout; never flash on the destroyed one.
    if (req.query.loggedOut === '1') req.flash('success', 'You have been logged out successfully.');
    res.render('login', { title: 'Login' });
};

const processLoginForm = async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string'
        || !email.trim() || email.trim().length > 100 || !password
        || Buffer.byteLength(password, 'utf8') > 72) {
        req.flash('error', 'Invalid email or password.');
        return res.redirect('/login');
    }

    try {
        const user = await authenticateUser(email.trim().toLowerCase(), password);
        if (!user) {
            req.flash('error', 'Invalid email or password.');
            return res.redirect('/login');
        }
        // Rotate the session before storing authenticated identity.
        await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
        req.session.user = user;
        req.flash('success', 'Login successful!');
        await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
        return res.redirect('/dashboard');
    } catch {
        if (!req.session) {
            return res.status(500).send('Unable to log in right now. Please try again.');
        }
        delete req.session.user;
        req.flash('error', 'Unable to log in right now. Please try again.');
        return res.redirect('/login');
    }
};

const processLogout = (req, res) => {
    req.session.destroy(error => {
        if (error) {
            // No flash call: destroy may already have removed req.session.
            return res.status(500).send('Unable to log out right now. Please try again.');
        }
        return res.redirect('/login?loggedOut=1');
    });
};

const requireLogin = (req, res, next) => {
    if (!(req.session && req.session.user)) {
        req.flash('error', 'You must be logged in to access that page.');
        return res.redirect('/login');
    }
    next();
};

const requireRole = (role, redirectTo = '/') => (req, res, next) => {
    if (req.session?.user?.role_name === role) {
        return next();
    }
    req.flash('error', 'You do not have permission to access that page.');
    return res.redirect(redirectTo);
};

const showUsersPage = async (req, res) => {
    const users = await getAllUsers();
    res.render('users', { title: 'Users', users });
};

const showDashboard = (req, res) => {
    const { name, email } = req.session.user;
    res.render('dashboard', { title: 'Dashboard', name, email });
};

export {
    userRegistrationValidation, showUserRegistrationForm, processUserRegistrationForm,
    showLoginForm, processLoginForm, processLogout, requireLogin, requireRole, showDashboard, showUsersPage
};
