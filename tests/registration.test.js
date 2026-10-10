import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcrypt';
import db from '../src/models/db.js';
import router from '../src/routes.js';
import { createUser } from '../src/models/users.js';

test('registration workflow with a stubbed database (no database connections)', async t => {
    const originalQuery = db.query;
    let queries = [];
    let databaseResult = { rows: [{ user_id: 42 }] };
    db.query = async (sql, params) => {
        queries.push({ sql, params });
        if (databaseResult instanceof Error) throw databaseResult;
        return databaseResult;
    };
    const messages = [];
    const app = express();
    app.set('view engine', 'ejs');
    app.set('views', fileURLToPath(new URL('../src/views', import.meta.url)));
    app.use(express.urlencoded({ extended: true }));
    app.use((req, res, next) => {
        req.flash = (type, message) => messages.push({ type, message });
        res.locals.flash = () => ({});
        res.locals.NODE_ENV = 'production';
        next();
    });
    app.use(router);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(async () => {
        db.query = originalQuery;
        await new Promise(resolve => server.close(resolve));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = async fields => {
        queries = [];
        messages.length = 0;
        return fetch(`${base}/register`, {
            method: 'POST', redirect: 'manual',
            body: new URLSearchParams(fields)
        });
    };

    await t.test('GET renders the registration form with existing partials', async () => {
        const response = await fetch(`${base}/register`);
        assert.equal(response.status, 200);
        const html = await response.text();
        assert.match(html, /<title>Register<\/title>/);
        assert.match(html, /action="\/register" method="POST"/);
        assert.match(html, /type="password"[^>]*minlength="8"/);
        assert.doesNotMatch(html, /type="password"[^>]*value=/);
        assert.match(html, /href="\/organizations"/);
        assert.equal(queries.length, 0);
    });

    await t.test('invalid input never reaches storage', async () => {
        const valid = { name: 'Test User', email: 'test@example.invalid', password: 'password123' };
        for (const invalid of [
            { name: '   ' }, { name: 'a'.repeat(101) },
            { email: 'invalid' }, { email: `${'a'.repeat(90)}@example.invalid` },
            { password: 'short' }, { password: '        ' },
            { password: 'a'.repeat(73) }, { password: '😀'.repeat(19) },
            { password: undefined }
        ]) {
            const fields = { ...valid, ...invalid };
            if (fields.password === undefined) delete fields.password;
            const response = await post(fields);
            assert.equal(response.headers.get('location'), '/register');
            assert.equal(queries.length, 0);
            assert.equal(messages[0].type, 'error');
        }
    });

    await t.test('success normalizes identity and hashes the unchanged password at cost 10', async () => {
        const password = '  password123  ';
        const response = await post({ name: ' Test User ', email: ' TEST@EXAMPLE.INVALID ', password });
        assert.equal(response.headers.get('location'), '/');
        assert.equal(queries.length, 1);
        const { sql, params } = queries[0];
        assert.match(sql, /WHERE role_name = 'user'/);
        assert.match(sql, /SELECT \$1, \$2, \$3, role_id/);
        assert.match(sql, /RETURNING user_id/);
        assert.deepEqual(params.slice(0, 2), ['Test User', 'test@example.invalid']);
        assert.notEqual(params[2], password);
        assert.equal(bcrypt.getRounds(params[2]), 10);
        assert.equal(await bcrypt.compare(password, params[2]), true);
        assert.equal(await bcrypt.compare(password.trim(), params[2]), false);
        assert.deepEqual(messages, [{ type: 'success', message: 'Registration successful! Please log in.' }]);
    });

    await t.test('every registration requires eight characters, including the grading email', async () => {
        for (const fields of [
            { email: 'other@example.com', password: 'cse340!' },
            { email: 'admin@example.com', password: 'cse340!' },
            { email: 'admin@example.com', password: 'cse340?' },
            { email: 'admin@example.com', password: 'cse340' }
        ]) {
            const rejected = await post({ name: 'Test User', ...fields });
            assert.equal(rejected.headers.get('location'), '/register');
            assert.equal(queries.length, 0);
            assert.equal(messages[0].type, 'error');
        }
        const accepted = await post({ name: 'Test User', email: 'admin@example.com', password: '12345678' });
        assert.equal(accepted.headers.get('location'), '/');
        assert.equal(queries.length, 1);
    });

    await t.test('duplicate email and database failures produce safe flash messages', async () => {
        for (const code of ['23505', '08006']) {
            databaseResult = Object.assign(new Error('sensitive database details'), { code });
            const response = await post({ name: 'Test User', email: 'test@example.invalid', password: 'password123' });
            assert.equal(response.headers.get('location'), '/register');
            assert.equal(messages[0].type, 'error');
            assert.doesNotMatch(messages[0].message, /sensitive/);
            if (code === '23505') assert.match(messages[0].message, /email already exists/);
        }
    });

    await t.test('model returns the ID and fails safely if the default role is absent', async () => {
        databaseResult = { rows: [{ user_id: 73 }] };
        assert.equal(await createUser('Test User', 'test@example.invalid', 'stubbed-hash'), 73);
        databaseResult = { rows: [] };
        await assert.rejects(createUser('Test User', 'test@example.invalid', 'stubbed-hash'), { message: 'Unable to create user' });
    });
});
