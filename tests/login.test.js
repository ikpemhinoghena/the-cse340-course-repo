import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import bcrypt from 'bcrypt';
import db from '../src/models/db.js';
import router from '../src/routes.js';
import flash from '../src/middleware/flash.js';
import { authenticateUser, findUserByEmail, verifyPassword } from '../src/models/users.js';

test('login and logout with real session middleware and a stubbed database', async t => {
    const password = '  correct-password  ';
    const passwordHash = await bcrypt.hash(password, 10);
    const row = { user_id: 7, name: 'Test User', email: 'test@example.invalid', password_hash: passwordHash, role_id: 2 };
    const safeUser = { user_id: 7, name: 'Test User', email: 'test@example.invalid', role_id: 2 };
    const originalQuery = db.query;
    let failDatabase = false;
    db.query = async (sql, params) => {
        assert.equal(sql, 'SELECT user_id, name, email, password_hash, role_id FROM users WHERE email = $1');
        if (failDatabase) throw new Error('Sensitive database error');
        return { rows: params[0] === row.email ? [row] : [] };
    };
    const store = new session.MemoryStore();
    const app = express();
    app.set('view engine', 'ejs');
    app.set('views', fileURLToPath(new URL('../src/views', import.meta.url)));
    app.use(session({ secret: 'local-test-only-session-secret', store, resave: false, saveUninitialized: true }));
    app.use((req, res, next) => {
        res.locals.isLoggedIn = Boolean(req.session.user);
        res.locals.NODE_ENV = 'production';
        next();
    });
    app.use(flash);
    app.use(express.urlencoded({ extended: true }));
    app.use(router);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(async () => {
        db.query = originalQuery;
        await new Promise(resolve => server.close(resolve));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    let cookie;
    const request = async (path, fields) => {
        const response = await fetch(base + path, {
            redirect: 'manual', headers: cookie ? { cookie } : {},
            ...(fields ? { method: 'POST', body: new URLSearchParams(fields) } : {})
        });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        return response;
    };
    const sessions = () => new Promise((resolve, reject) => store.all((error, entries) => error ? reject(error) : resolve(entries)));

    await t.test('model verifies passwords and excludes the hash', async () => {
        assert.equal(await findUserByEmail('missing@example.invalid'), null);
        assert.equal(await authenticateUser('missing@example.invalid', password), null);
        assert.equal(await authenticateUser(row.email, 'wrong-password'), null);
        assert.equal(await verifyPassword(password, passwordHash), true);
        assert.deepEqual(await authenticateUser(row.email, password), safeUser);
        assert.equal(row.password_hash, passwordHash);
    });

    await t.test('GET renders accessible login fields and logged-out navigation', async () => {
        const response = await request('/login');
        assert.equal(response.status, 200);
        const html = await response.text();
        assert.match(html, /action="\/login" method="POST"/);
        assert.match(html, /<label for="email">Email<\/label>/);
        assert.match(html, /type="password"[^>]*required/);
        assert.doesNotMatch(html, /type="password"[^>]*value=/);
        assert.match(html, /href="\/login"/);
        assert.match(html, /href="\/register"/);
        assert.doesNotMatch(html, /href="\/logout"/);
    });

    await t.test('wrong email/password and malformed fields give the same generic error', async () => {
        for (const fields of [
            { email: 'missing@example.invalid', password },
            { email: row.email, password: 'wrong-password' },
            { email: row.email },
            { email: row.email, password: 'a'.repeat(73) }
        ]) {
            const response = await request('/login', fields);
            assert.equal(response.headers.get('location'), '/login');
            const html = await (await request('/login')).text();
            assert.match(html, /Invalid email or password\./);
            assert.ok(Object.values(await sessions()).every(value => !value.user));
        }
    });

    await t.test('unauthenticated dashboard redirects with the required flash error', async () => {
        const response = await request('/dashboard');
        assert.equal(response.status, 302);
        assert.equal(response.headers.get('location'), '/login');
        const html = await (await request('/login')).text();
        assert.match(html, /You must be logged in to access that page\./);
    });

    await t.test('unauthenticated home hides the dashboard link', async () => {
        const response = await request('/');
        assert.equal(response.status, 200);
        assert.doesNotMatch(await response.text(), /My Dashboard|href="\/dashboard"/);
    });

    await t.test('unexpected database errors are handled without details', async () => {
        failDatabase = true;
        const response = await request('/login', { email: row.email, password });
        failDatabase = false;
        assert.equal(response.headers.get('location'), '/login');
        const html = await (await request('/login')).text();
        assert.match(html, /Unable to log in right now/);
        assert.doesNotMatch(html, /Sensitive database error/);
    });

    await t.test('successful login rotates the session and stores only the safe user', async () => {
        const oldCookie = cookie;
        const response = await request('/login', { email: ' TEST@EXAMPLE.INVALID ', password });
        assert.equal(response.headers.get('location'), '/dashboard');
        assert.notEqual(cookie, oldCookie);
        const values = Object.values(await sessions());
        assert.equal(values.length, 1);
        assert.deepEqual(values[0].user, safeUser);
        assert.ok(!JSON.stringify(values).includes('password_hash'));
        const html = await (await request('/register')).text();
        assert.match(html, /Login successful!/);
        assert.match(html, /href="\/logout"/);
        assert.doesNotMatch(html, /href="\/(login|register)"/);
        assert.match(html, /href="\/organizations"/);
    });

    await t.test('authenticated dashboard renders only escaped name and email', async () => {
        row.name = '<script>alert("test")</script>';
        row.email = 'test+<tag>@example.invalid';
        // Log in again to store the updated fixture in the session.
        const login = await request('/login', { email: row.email, password });
        assert.equal(login.headers.get('location'), '/dashboard');
        const response = await request('/dashboard');
        assert.equal(response.status, 200);
        const html = await response.text();
        assert.match(html, /<h1>Dashboard<\/h1>/);
        assert.match(html, /&lt;script&gt;alert\(&#34;test&#34;\)&lt;\/script&gt;/);
        assert.match(html, /test\+&lt;tag&gt;@example\.invalid/);
        assert.doesNotMatch(html, /<script>|password_hash|role_id/);
        assert.ok(!html.includes(passwordHash));
    });

    await t.test('authenticated home shows the dashboard link', async () => {
        const response = await request('/');
        assert.equal(response.status, 200);
        assert.match(await response.text(), /<a href="\/dashboard">My Dashboard<\/a>/);
    });

    await t.test('logout destroys identity and flashes success on the new session', async () => {
        const oldCookie = cookie;
        const response = await request('/logout');
        assert.equal(response.headers.get('location'), '/login?loggedOut=1');
        assert.equal(Object.keys(await sessions()).length, 0);
        const html = await (await request(response.headers.get('location'))).text();
        assert.notEqual(cookie, oldCookie);
        assert.match(html, /You have been logged out successfully\./);
        assert.match(html, /href="\/login"/);
        assert.match(html, /href="\/register"/);
        assert.ok(Object.values(await sessions()).every(value => !value.user));
        const nextHtml = await (await request('/login')).text();
        assert.doesNotMatch(nextHtml, /You have been logged out successfully\./);
        const dashboard = await request('/dashboard');
        assert.equal(dashboard.status, 302);
        assert.equal(dashboard.headers.get('location'), '/login');
        const home = await (await request('/')).text();
        assert.doesNotMatch(home, /My Dashboard|href="\/dashboard"/);
    });
});
