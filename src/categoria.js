import express from "express";
import pool from "../db.js";
// Importamos el middleware (asegúrate de que la ruta sea correcta)
import { isAuthenticated } from "./authenticated.js"; 

const router = express.Router();

// --- 1. LISTAR CATEGORÍAS (READ) ---
// Agregamos protección para que solo el admin vea la lista de gestión
router.get("/categorialista", isAuthenticated, async (req, res) => {
    try {
        const [data] = await pool.query("SELECT * FROM categoria ORDER BY id_categoria");
        res.render("categoriacambia", { data });
    } catch (error) {
        console.error("Error al obtener categorías:", error.message);
        res.status(500).send("Error en el servidor");
    }
});

// --- 2. FORMULARIO NUEVA CATEGORÍA (GET) ---
router.get("/categorianueva", isAuthenticated, (req, res) => {
    res.render("categoria", { data: null }); 
});

// --- 3. INSERTAR CATEGORÍA (CREATE) ---
router.post("/categoriainsertar", isAuthenticated, async (req, res) => {
    try {
        const { des } = req.body;

        if (!des || des.trim() === "") {
            return res.status(400).send("Error: La descripción es obligatoria.");
        }

        const sqlText = "INSERT INTO categoria (des) VALUES (?)";
        await pool.query(sqlText, [des.trim()]);

        res.redirect("/categorialista");
    } catch (error) {
        console.error("Error al insertar:", error.message);
        res.status(500).send("Error en el servidor: " + error.message);
    }
});

// --- 4. FORMULARIO EDITAR CATEGORÍA (GET) ---
router.get("/categoriaeditar/:id", isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const [data] = await pool.query("SELECT * FROM categoria WHERE id_categoria = ?", [id]);
        res.render("categoria", { data });
    } catch (error) {
        res.status(500).send("Error al cargar formulario");
    }
});

// --- 5. GUARDAR CAMBIOS (POST) ---
router.post("/categoriamodi/:id", isAuthenticated, async (req, res) => {
    const { id } = req.params;
    const { des } = req.body;

    try {
        await pool.query("UPDATE categoria SET des = ? WHERE id_categoria = ?", [des, id]);
        res.redirect("/categorialista");
    } catch (error) {
        console.error(error);
        res.status(500).send("Error al actualizar");
    }
});

// --- 6. ELIMINAR CATEGORÍA (DELETE) ---
router.get("/categoriaborrar/:id", isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        // Fallará si la categoría está en uso por algún mascota (Integridad referencial)
        await pool.query("DELETE FROM categoria WHERE id_categoria = ?", [id]);
        res.redirect("/categorialista");
    } catch (error) {
        console.error("Error al eliminar:", error.message);
        res.status(500).send("No se puede eliminar: Verifique si hay mascotas vinculados.");
    }
});

export default router;
