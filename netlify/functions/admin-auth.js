exports.handler = async function(event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { password } = JSON.parse(event.body);
        const correctPassword = process.env.ADMIN_PASSWORD;

        if (!correctPassword || password !== correctPassword) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Credenciales inválidas' }) };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ 
                success: true, 
                unlimited: true, 
                token: 'GK_ADMIN_' + Date.now() 
            })
        };
    } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};