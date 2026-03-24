import jwt from 'jsonwebtoken';

export const isAuthenticated = (req, res, next) => {
    // 1. PRIORIDAD: Sesión activa en memoria
    if (req.session && req.session.user) {
        return next();
    }

    // 2. RESPALDO: ¿Hay un Token en las Cookies?
    const token = req.cookies.token_acceso;

    if (token) {
        try {
            // Verificamos el token
            const decoded = jwt.verify(token, process.env.JWT_SECRETO);
            
            // Reconstruimos el objeto con la CATEGORÍA
            req.session.user = { 
                id: decoded.id, 
                nombre: decoded.nombre || "Usuario",
                categoria: decoded.categoria // <--- AHORA SE RESTAURA EL ROL
            };
            
            console.log(`✅ Sesión restaurada: ${decoded.nombre} (${decoded.categoria})`);
            return next();
        } catch (error) {
            console.error("❌ Token inválido o expirado:", error.message);
            
            res.clearCookie('token_acceso');
            res.locals.user = null;
            if (req.session) {
                req.session.user = null;
            }
        }
    }

    // 3. BLOQUEO: Si no hay nada, al Login
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(401).json({ error: 'Sesión expirada' });
    }

    return res.redirect("/signin");
};