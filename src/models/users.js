import db from './db.js';
import bcrypt from 'bcrypt';

const createUser = async (name, email, passwordHash) => {
    const query = `
        INSERT INTO users (name, email, password_hash, role_id)
        SELECT $1, $2, $3, role_id
        FROM roles
        WHERE role_name = 'user'
        RETURNING user_id;
    `;

    try {
        const result = await db.query(query, [name, email, passwordHash]);
        if (result.rows.length === 0) {
            throw new Error('Default user role is unavailable');
        }
        return result.rows[0].user_id;
    } catch (error) {
        // Preserve only the code needed by the controller, never database details.
        const registrationError = new Error('Unable to create user');
        if (error.code === '23505') registrationError.code = '23505';
        throw registrationError;
    }
};

const findUserByEmail = async (email) => {
    try {
        const result = await db.query(
            'SELECT u.user_id, u.name, u.email, u.password_hash, r.role_name FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.email = $1',
            [email]
        );
        return result.rows[0] ?? null;
    } catch {
        throw new Error('Unable to authenticate user');
    }
};

const getAllUsers = async () => {
    const result = await db.query(`
        SELECT u.name, u.email, r.role_name
        FROM users u
        JOIN roles r ON u.role_id = r.role_id
        ORDER BY u.name, u.email;
    `);
    return result.rows;
};

const verifyPassword = async (password, passwordHash) => bcrypt.compare(password, passwordHash);

const authenticateUser = async (email, password) => {
    const user = await findUserByEmail(email);
    if (!user || !await verifyPassword(password, user.password_hash)) return null;
    const { password_hash, ...safeUser } = user;
    return safeUser;
};

export { createUser, findUserByEmail, verifyPassword, authenticateUser, getAllUsers };
