// Netlify valida la firma del JWT de Identity antes de invocar la función
// y deja el usuario verificado en context.clientContext.user.
function getUser(context) {
    const u = context && context.clientContext && context.clientContext.user;
    if (!u || !u.sub) return null;

    const roles = (u.app_metadata && u.app_metadata.roles) || [];
    const admins = (process.env.ADMIN_EMAILS || '')
        .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const email = (u.email || '').toLowerCase();

    return {
        id: u.sub,
        email: u.email || null,
        isAdmin: roles.includes('admin') || (!!email && admins.includes(email))
    };
}

module.exports = { getUser };
