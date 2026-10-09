import db from './db.js';

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

export { createUser };
