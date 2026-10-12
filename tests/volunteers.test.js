import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import session from 'express-session';
import { fileURLToPath } from 'node:url';
import db from '../src/models/db.js';
import router from '../src/routes.js';
import flash from '../src/middleware/flash.js';
import { addVolunteer, removeVolunteer, isVolunteer, getVolunteeredProjects } from '../src/models/volunteers.js';

test('volunteer model uses parameterized, ownership-scoped queries', async t => {
    const original = db.query;
    t.after(() => { db.query = original; });
    const queries = [];
    let rows = [{ project_id: 3 }];
    db.query = async (sql, params) => { queries.push({ sql, params }); return { rows }; };
    assert.equal(await addVolunteer(7, 3), true);
    assert.match(queries.at(-1).sql, /ON CONFLICT \(user_id, project_id\) DO NOTHING/);
    assert.deepEqual(queries.at(-1).params, [7, 3]);
    rows = [];
    assert.equal(await addVolunteer(7, 3), false);
    assert.equal(await removeVolunteer(7, 3), false);
    assert.match(queries.at(-1).sql, /WHERE user_id = \$1 AND project_id = \$2/);
    assert.deepEqual(queries.at(-1).params, [7, 3]);
    assert.equal(await isVolunteer(7, 3), false);
    rows = [{ project_id: 3 }];
    assert.equal(await isVolunteer(7, 3), true);
    assert.deepEqual(await getVolunteeredProjects(7), rows);
    assert.deepEqual(queries.at(-1).params, [7]);
    assert.match(queries.at(-1).sql, /WHERE v.user_id = \$1/);
    assert.match(queries.at(-1).sql, /ORDER BY p.date, p.title, p.project_id/);
});

test('volunteer routes and dashboard with real sessions and a stubbed database', async t => {
    const original = db.query;
    const queries = [];
    const signups = new Set(['8:1']);
    const project = { project_id: 1, title: '<script>Project</script>', date: '2026-10-17',
        location: 'Campus', organization_id: 1, organization_name: 'Organization' };
    let identity = null;
    let fail = false;
    db.query = async (sql, params) => {
        queries.push({ sql, params });
        if (fail) throw new Error('Private database details');
        const key = `${params?.[0]}:${params?.[1]}`;
        if (sql.includes('INSERT INTO public.project_volunteer')) {
            if (signups.has(key)) return { rows: [] };
            signups.add(key);
            return { rows: [{ project_id: Number(params[1]) }] };
        }
        if (sql.includes('DELETE FROM public.project_volunteer')) {
            return { rows: signups.delete(key) ? [{ project_id: Number(params[1]) }] : [] };
        }
        if (sql.includes('SELECT project_id FROM public.project_volunteer')) {
            return { rows: signups.has(key) ? [{ project_id: Number(params[1]) }] : [] };
        }
        if (sql.includes('FROM public.project_volunteer AS v')) {
            return { rows: signups.has(`${params[0]}:1`) ? [project] : [] };
        }
        if (sql.includes('FROM public.project_category')) return { rows: [] };
        if (sql.includes('FROM public.service_project')) {
            return { rows: Number(params[0]) === 1 ? [project] : [] };
        }
        assert.fail(`Unexpected query: ${sql}`);
    };
    const app = express();
    app.set('view engine', 'ejs');
    app.set('views', fileURLToPath(new URL('../src/views', import.meta.url)));
    app.use(session({ secret: 'volunteer-test-secret', resave: false, saveUninitialized: true }));
    app.use(express.urlencoded({ extended: true }));
    app.use((req, res, next) => {
        req.session.user = identity;
        res.locals.user = identity;
        res.locals.isLoggedIn = Boolean(identity);
        res.locals.NODE_ENV = 'production';
        next();
    });
    app.use(flash);
    app.use(router);
    app.use((error, req, res, next) => res.status(error.status || 500).send('Request failed'));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(async () => { db.query = original; await new Promise(resolve => server.close(resolve)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const client = () => {
        let cookie;
        return async (path, fields) => {
            const response = await fetch(base + path, {
                redirect: 'manual', headers: cookie ? { cookie } : {},
                ...(fields ? { method: 'POST', body: new URLSearchParams(fields) } : {})
            });
            const setCookie = response.headers.get('set-cookie');
            if (setCookie) cookie = setCookie.split(';')[0];
            return response;
        };
    };
    const request = client();
    let token;
    const signupPath = '/project/1/volunteer';
    const removePath = '/project/1/volunteer/remove';

    await t.test('guests have no controls and POST actions require login before queries', async () => {
        const html = await (await request('/project/1')).text();
        assert.doesNotMatch(html, /volunteerCsrfToken|<form/);
        for (const path of [signupPath, removePath]) {
            queries.length = 0;
            const response = await request(path, { user_id: '8' });
            assert.equal(response.headers.get('location'), '/login');
            assert.equal(queries.length, 0);
        }
        assert.equal((await request('/dashboard')).headers.get('location'), '/login');
    });

    await t.test('authenticated users receive a token and an empty dashboard', async () => {
        identity = { user_id: 7, name: 'User', email: 'user@example.invalid', role_name: 'user' };
        const html = await (await request('/project/1')).text();
        assert.match(html, /<button type="submit">Volunteer<\/button>/);
        token = html.match(/name="volunteerCsrfToken" value="([a-f0-9]{64})"/)[1];
        assert.match(await (await request('/dashboard')).text(), /not volunteered for any projects/);
    });

    await t.test('CSRF rejects missing, malformed, incorrect, and other-session tokens', async () => {
        const otherRequest = client();
        const otherHtml = await (await otherRequest('/project/1')).text();
        const otherToken = otherHtml.match(/name="volunteerCsrfToken" value="([a-f0-9]{64})"/)[1];
        for (const path of [signupPath, removePath]) {
            for (const fields of [{}, { volunteerCsrfToken: 'bad' },
                { volunteerCsrfToken: '0'.repeat(64) }, { volunteerCsrfToken: otherToken },
                { 'volunteerCsrfToken[]': token }]) {
                queries.length = 0;
                assert.equal((await request(path, fields)).status, 403);
                assert.equal(queries.length, 0);
            }
        }
    });

    await t.test('invalid IDs fail before database access and missing projects return 404', async () => {
        for (const suffix of ['volunteer', 'volunteer/remove']) {
            for (const id of ['0', '-1', 'abc', '1.5', '2147483648', '1e2']) {
                queries.length = 0;
                assert.equal((await request(`/project/${id}/${suffix}`, { volunteerCsrfToken: token })).status, 400);
                assert.equal(queries.length, 0);
            }
            assert.equal((await request(`/project/999/${suffix}`, { volunteerCsrfToken: token })).status, 404);
        }
        assert.equal((await request('/project/999')).status, 404);
        assert.equal((await request('/project/abc')).status, 400);
    });

    await t.test('signup ignores forged identity and handles duplicates', async () => {
        const fields = { volunteerCsrfToken: token, user_id: '8', userId: '8' };
        for (let attempt = 0; attempt < 2; attempt++) {
            assert.equal((await request(signupPath, fields)).headers.get('location'), '/project/1');
            const html = await (await request('/project/1')).text();
            assert.match(html, /You are volunteering for this project/);
            assert.match(html, /Cancel signup/);
            assert.match(html, attempt === 0 ? /You have volunteered/ : /already volunteering/);
        }
        assert.deepEqual([...signups].sort(), ['7:1', '8:1']);
        assert.deepEqual(queries.find(({ sql }) => sql.includes('INSERT INTO')).params, [7, '1']);
    });

    await t.test('dashboard shows escaped project details, links, and cancellation token', async () => {
        const html = await (await request('/dashboard')).text();
        assert.match(html, /href="\/project\/1"/);
        assert.match(html, /&lt;script&gt;Project&lt;\/script&gt;/);
        assert.doesNotMatch(html, /<script>/);
        assert.match(html, /Campus/);
        assert.match(html, /Organization/);
        assert.match(html, /action="\/project\/1\/volunteer\/remove" method="POST"/);
        assert.ok(html.includes(`value="${token}"`));
    });

    await t.test('cancellation removes only the session user and is safe to repeat', async () => {
        for (let attempt = 0; attempt < 2; attempt++) {
            assert.equal((await request(removePath, { volunteerCsrfToken: token, user_id: '8' }))
                .headers.get('location'), '/dashboard');
            assert.equal(signups.has('8:1'), true);
            assert.equal(signups.has('7:1'), false);
            assert.match(await (await request('/dashboard')).text(), /not volunteered for any projects/);
        }
    });

    await t.test('admins manage only their own signups', async () => {
        identity = { ...identity, role_name: 'admin' };
        await request(signupPath, { volunteerCsrfToken: token });
        await request(removePath, { volunteerCsrfToken: token, user_id: '8' });
        assert.deepEqual([...signups], ['8:1']);
    });

    await t.test('database errors reach error handling without exposing details', async () => {
        fail = true;
        for (const path of [signupPath, removePath]) {
            const response = await request(path, { volunteerCsrfToken: token });
            assert.equal(response.status, 500);
            assert.doesNotMatch(await response.text(), /Private database details/);
        }
        assert.equal((await request('/dashboard')).status, 500);
        fail = false;
    });
});
