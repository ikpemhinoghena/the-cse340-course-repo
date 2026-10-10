import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import session from 'express-session';
import { fileURLToPath } from 'node:url';
import db from '../src/models/db.js';
import router from '../src/routes.js';
import flash from '../src/middleware/flash.js';

test('Users page access, safe rendering, and dashboard navigation', async t => {
    const originalQuery = db.query;
    let rows = [
        { name: 'Admin', email: 'admin@example.com', role_name: 'admin', password_hash: 'must-not-render' },
        { name: '<script>test</script>', email: 'user@example.com', role_name: 'user' }
    ];
    let fail = false;
    let queries = 0;
    db.query = async sql => {
        queries++;
        assert.equal(sql.replace(/\s+/g, ' ').trim(), 'SELECT u.name, u.email, r.role_name FROM users u JOIN roles r ON u.role_id = r.role_id ORDER BY u.name, u.email;');
        if (fail) throw new Error('test database failure');
        return { rows };
    };
    let identity = null;
    const app = express();
    app.set('view engine', 'ejs');
    app.set('views', fileURLToPath(new URL('../src/views', import.meta.url)));
    app.use(session({ secret: 'users-page-test-secret', resave: false, saveUninitialized: true }));
    app.use((req, res, next) => {
        // Trusted test fixture, never taken from request input.
        req.session.user = identity;
        res.locals.user = req.session.user || null;
        res.locals.isLoggedIn = Boolean(identity);
        res.locals.NODE_ENV = 'production';
        next();
    });
    app.use(flash);
    app.use(router);
    app.use((error, req, res, next) => res.status(500).send('Server Error'));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(async () => { db.query = originalQuery; await new Promise(resolve => server.close(resolve)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    let cookie;
    const request = async path => {
        const response = await fetch(base + path, { redirect: 'manual', headers: cookie ? { cookie } : {} });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        return response;
    };

    await t.test('guests go to login with flash and never query users', async () => {
        const response = await request('/users?role_name=admin');
        assert.equal(response.status, 302);
        assert.equal(response.headers.get('location'), '/login');
        assert.equal(queries, 0);
        const html = await (await request('/login')).text();
        assert.match(html, /You must be logged in/);
        assert.doesNotMatch(html, /href="\/users"/);
    });
    await t.test('regular users go to dashboard with flash and no Users link', async () => {
        identity = { name: 'Ordinary User', email: 'user@example.com', role_name: 'user' };
        const response = await request('/users?role_name=admin');
        assert.equal(response.status, 302);
        assert.equal(response.headers.get('location'), '/dashboard');
        assert.equal(queries, 0);
        const dashboard = await request('/dashboard');
        assert.equal(dashboard.status, 200);
        const html = await dashboard.text();
        assert.match(html, /You do not have permission/);
        assert.match(html, /Ordinary User/);
        assert.doesNotMatch(html, /href="\/users"/);
    });
    await t.test('admins see the dashboard link and all escaped user rows without hashes', async () => {
        identity = { name: 'Admin', email: 'admin@example.com', role_name: 'admin' };
        assert.match(await (await request('/dashboard')).text(), /href="\/users"/);
        const response = await request('/users');
        assert.equal(response.status, 200);
        const html = await response.text();
        for (const value of ['Name', 'Email', 'Role', 'Admin', 'admin@example.com', 'user@example.com', 'admin', 'user']) assert.ok(html.includes(value));
        assert.match(html, /&lt;script&gt;test&lt;\/script&gt;/);
        assert.doesNotMatch(html, /<script>|password_hash|must-not-render|role_id/);
        assert.equal(queries, 1);
    });
    await t.test('empty list has a useful empty state', async () => {
        rows = [];
        const response = await request('/users');
        assert.equal(response.status, 200);
        assert.match(await response.text(), /No registered users found/);
    });
    await t.test('database errors reach Express error handling', async () => {
        fail = true;
        const response = await request('/users');
        assert.equal(response.status, 500);
        assert.equal(await response.text(), 'Server Error');
    });
});
