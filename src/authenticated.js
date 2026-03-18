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
            
            req.session.user = { 
                id: decoded.id, 
                nombre: decoded.nombre || "Usuario" 
            };
            
            console.log("✅ Sesión restaurada mediante Token (ID/Celular):", decoded.id);
            return next();
        } catch (error) {
            console.error("❌ Token inválido o expirado:", error.message);
            
            // --- LIMPIEZA DE SEGURIDAD ---
            res.clearCookie('token_acceso'); // Borra la cookie del navegador
            res.locals.user = null;          // Quita el nombre de las vistas Handlebars
            if (req.session) {
                req.session.user = null;     // Limpia el usuario de la sesión
            }
            // -----------------------------
        }
    }

    // 3. BLOQUEO: Si no hay nada, al Login
    console.log("🚫 Acceso denegado. Redirigiendo a /signin");
    
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(401).json({ error: 'Sesión expirada' });
    }

    return res.redirect("/signin");
};
