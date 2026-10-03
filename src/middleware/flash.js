const flashMiddleware = (req, res, next) => {
    req.flash = function(type, message) {
        if (!req.session.flash) {
            req.session.flash = {
                success: [],
                error: [],
                warning: [],
                info: []
            };
        }

        if (arguments.length === 2) {
            if (!req.session.flash[type]) {
                req.session.flash[type] = [];
            }
            req.session.flash[type].push(message);
            return;
        }

        if (arguments.length === 1) {
            const messages = req.session.flash[type] || [];
            req.session.flash[type] = [];
            return messages;
        }

        const messages = req.session.flash;
        req.session.flash = {
            success: [],
            error: [],
            warning: [],
            info: []
        };
        return messages;
    };

    next();
};

const flashLocals = (req, res, next) => {
    res.locals.flash = req.flash;
    next();
};

const flash = (req, res, next) => {
    flashMiddleware(req, res, () => {
        flashLocals(req, res, next);
    });
};

export default flash;
