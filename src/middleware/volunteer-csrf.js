import { randomBytes, timingSafeEqual } from 'node:crypto';

// Only the project details and dashboard volunteer forms use this token.
const volunteerCsrfToken = (req, res, next) => {
    if (req.session?.user) {
        req.session.volunteerCsrfToken ??= randomBytes(32).toString('hex');
        res.locals.volunteerCsrfToken = req.session.volunteerCsrfToken;
    }
    next();
};

const requireVolunteerCsrf = (req, res, next) => {
    const expected = req.session?.volunteerCsrfToken;
    const submitted = req.body?.volunteerCsrfToken;
    if (typeof expected !== 'string' || typeof submitted !== 'string'
        || Buffer.byteLength(expected) !== Buffer.byteLength(submitted)
        || !timingSafeEqual(Buffer.from(expected), Buffer.from(submitted))) {
        return res.status(403).send('Invalid volunteer form token. Reload the page and try again.');
    }
    next();
};

export { volunteerCsrfToken, requireVolunteerCsrf };
