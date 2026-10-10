import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { fileURLToPath } from 'node:url';
import db from '../src/models/db.js';
import router from '../src/routes.js';
import { requireRole } from '../src/controllers/users.js';

const management = ['/new-organization', '/edit-organization/1', '/new-project', '/edit-project/1', '/assign-categories/1', '/new-category', '/edit-category/1'];
const publicPages = ['/organizations', '/organization/1', '/projects', '/project/1', '/categories', '/category/1'];
const record = { organization_id: 1, project_id: 1, category_id: 1, name: 'Public fixture', title: 'Public project', description: 'Public description', contact_email: 'contact@example.com', logo_filename: 'logo.png', organization_name: 'Public fixture', date: '2026-10-10', location: 'Campus' };

test('requireRole safely denies missing sessions and trusts only session roles', () => {
    for (const session of [undefined, {}, { user: { role_name: 'user' } }]) {
        const messages = [];
        requireRole('admin')({ session, body: { role_name: 'admin' }, query: { role_name: 'admin' }, flash: (...args) => messages.push(args) }, { redirect: path => assert.equal(path, '/') }, () => assert.fail('Unauthorized next'));
        assert.equal(messages[0][0], 'error');
    }
    let allowed = false;
    requireRole('admin')({ session: { user: { role_name: 'admin' } } }, {}, () => { allowed = true; });
    assert.ok(allowed);
});

test('management authorization and public views with a stubbed database', async t => {
    const original = db.query;
    const queries = [];
    db.query = async (sql, params) => { queries.push({ sql, params }); return { rows: [{ ...record }] }; };
    let user = null;
    const messages = [];
    let lastBody;
    const app = express();
    app.set('view engine', 'ejs');
    app.set('views', fileURLToPath(new URL('../src/views', import.meta.url)));
    app.use(express.urlencoded({ extended: true }));
    app.use((req, res, next) => {
        req.session = { user };
        req.flash = (...args) => messages.push(args);
        res.locals.user = user;
        res.locals.isLoggedIn = Boolean(user);
        res.locals.NODE_ENV = 'production';
        res.locals.flash = () => ({});
        lastBody = req.body;
        next();
    });
    app.use(router);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(async () => { db.query = original; await new Promise(resolve => server.close(resolve)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const fields = { name: 'Valid name', description: 'Description', contactEmail: 'contact@example.com', title: 'Valid title', location: 'Campus', date: '2026-10-10', organizationId: '1', categoryIds: '1', logoFilename: 'logo.png', role_name: 'admin' };
    const request = (path, method = 'GET', body = fields) => fetch(base + path, { method, redirect: 'manual', ...(method === 'POST' ? { body: new URLSearchParams(body) } : {}) });

    for (const identity of [null, { role_name: 'user' }, { role_name: 'admin' }]) {
        user = identity;
        const admin = user?.role_name === 'admin';
        await t.test(`${user?.role_name || 'guest'} management access`, async () => {
            for (const path of management) {
                for (const method of ['GET', 'POST']) {
                    queries.length = 0;
                    messages.length = 0;
                    const response = await request(path, method, admin ? fields : { ...fields, name: '  x  ' });
                    if (admin) {
                        assert.equal(response.status, method === 'GET' ? 200 : 302, `${method} ${path}`);
                        if (method === 'POST') {
                            assert.notEqual(response.headers.get('location'), '/');
                            assert.ok(queries.some(({ sql }) => /INSERT|UPDATE|DELETE/.test(sql)), path);
                            assert.equal(messages.at(-1)[0], 'success');
                        }
                    } else {
                        assert.equal(response.status, 302);
                        assert.equal(response.headers.get('location'), '/');
                        assert.equal(queries.length, 0);
                        assert.deepEqual(messages, [['error', 'You do not have permission to access that page.']]);
                        if (method === 'POST') assert.equal(lastBody.name, '  x  ', 'authorization precedes sanitization');
                    }
                }
            }
        });
        await t.test(`${user?.role_name || 'guest'} public content and management links`, async () => {
            for (const path of publicPages) {
                const response = await request(path);
                assert.equal(response.status, 200);
                const html = await response.text();
                assert.match(html, /Public fixture|Public project/);
                const links = html.match(/href="\/(?:new-|edit-|assign-categories\/)[^"]*"/g) || [];
                assert.equal(links.length > 0, admin, path);
                if (user) assert.match(html, /href="\/logout"/);
            }
        });
    }
});
