// ========================================
// DASHBOARD ECOALERTA - Versión Final
// ========================================

document.addEventListener("DOMContentLoaded", async function () {
    if (typeof window.supabase === "undefined" || typeof window.supabase.from !== "function") {
        alert("❌ Error: Supabase no está inicializado.");
        console.error("Supabase no disponible en dashboard");
        return;
    }
    console.log("✅ Dashboard conectado a Supabase");

    await cargarReportes();
    await cargarEstadisticas();
});

// ========================================
// 1. CARGAR REPORTES (con nombre de usuario)
// ========================================
async function cargarReportes() {
    try {
        const { data: reportes, error } = await window.supabase
            .from("reportes")
            .select(`
                id,
                tipo,
                descripcion,
                ubicacion,
                direccion,
                gravedad,
                estado,
                fecha_reporte,
                usuario_id,
                usuarios ( nombre, correo )
            `)
            .order("fecha_reporte", { ascending: false });

        if (error) {
            console.error("Error al cargar reportes:", error);
            return;
        }

        const tbody = document.getElementById("cuerpo-tabla");
        tbody.innerHTML = "";

        if (!reportes || reportes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:#6f8f90;">No hay reportes aún.</td></tr>`;
            return;
        }

        for (let reporte of reportes) {
            const tr = document.createElement("tr");

            // ---- ID (corto) ----
            const tdId = document.createElement("td");
            tdId.textContent = reporte.id.slice(0, 8) + "…";
            tdId.style.fontSize = "12px";
            tdId.style.color = "#4a6b6c";

            // ---- Usuario (nombre real) ----
            const tdUsuario = document.createElement("td");
            tdUsuario.textContent = reporte.usuarios?.nombre || "Anónimo";
            tdUsuario.style.fontWeight = "500";

            // ---- Ubicación ----
            const tdUbicacion = document.createElement("td");
            tdUbicacion.textContent = reporte.ubicacion || "N/A";

            // ---- Dirección ----
            const tdDireccion = document.createElement("td");
            tdDireccion.textContent = reporte.direccion || "N/A";
            tdDireccion.style.maxWidth = "140px";
            tdDireccion.style.wordBreak = "break-word";

            // ---- Tipo ----
            const tdTipo = document.createElement("td");
            tdTipo.textContent = reporte.tipo || "N/A";

            // ---- Gravedad ----
            const tdGravedad = document.createElement("td");
            const gravedad = reporte.gravedad || "media";
            tdGravedad.textContent = gravedad.charAt(0).toUpperCase() + gravedad.slice(1);
            if (gravedad === "alta") tdGravedad.style.color = "#991b1b";
            else if (gravedad === "media") tdGravedad.style.color = "#854d0e";
            else tdGravedad.style.color = "#166534";
            tdGravedad.style.fontWeight = "600";

            // ---- Estado (etiqueta) ----
            const tdEstado = document.createElement("td");
            const estadoActual = reporte.estado || "reportado";
            const spanEstado = document.createElement("span");
            spanEstado.textContent = estadoActual.replace("_", " ").toUpperCase();
            spanEstado.className = `estado-${estadoActual}`;
            tdEstado.appendChild(spanEstado);

            // ---- Acción (selector) ----
            const tdAccion = document.createElement("td");
            const select = document.createElement("select");
            select.className = "estado-select";

            const estados = ["reportado", "en_revision", "en_proceso", "solucionado"];
            const nombres = {
                "reportado": "🔴 Reportado",
                "en_revision": "🟡 En revisión",
                "en_proceso": "🔵 En proceso",
                "solucionado": "🟢 Solucionado"
            };

            for (let est of estados) {
                const opt = document.createElement("option");
                opt.value = est;
                opt.textContent = nombres[est];
                if (est === estadoActual) opt.selected = true;
                select.appendChild(opt);
            }

            // ===== EVENTO CAMBIO DE ESTADO (CORREGIDO) =====
            select.addEventListener("change", async function () {
                const nuevoEstado = this.value;
                const estadoAnterior = reporte.estado;
                const reporteId = reporte.id;
                const selectRef = this;

                if (!confirm(`¿Cambiar estado a "${nombres[nuevoEstado]}"?`)) {
                    selectRef.value = estadoAnterior;
                    return;
                }

                selectRef.disabled = true;

                try {
                    const { data, error } = await window.supabase
                        .from("reportes")
                        .update({ estado: nuevoEstado })
                        .eq("id", reporteId)
                        .select();

                    if (error) {
                        console.error("Error al actualizar:", error);
                        alert(`❌ Error: ${error.message}`);
                        selectRef.value = estadoAnterior;
                        return;
                    }

                    // Actualizar la etiqueta de estado en la misma fila
                    spanEstado.textContent = nuevoEstado.replace("_", " ").toUpperCase();
                    spanEstado.className = `estado-${nuevoEstado}`;

                    // Actualizar la variable local (para que el próximo cambio use el nuevo estado como "anterior")
                    reporte.estado = nuevoEstado;

                    // Refrescar estadísticas de arriba
                    await cargarEstadisticas();

                    alert("✅ Estado actualizado correctamente.");

                } catch (err) {
                    console.error("Error inesperado:", err);
                    alert("❌ Error inesperado.");
                    selectRef.value = estadoAnterior;
                } finally {
                    selectRef.disabled = false;
                }
            });

            tdAccion.appendChild(select);

            // ---- Armar la fila ----
            tr.appendChild(tdId);
            tr.appendChild(tdUsuario);
            tr.appendChild(tdUbicacion);
            tr.appendChild(tdDireccion);
            tr.appendChild(tdTipo);
            tr.appendChild(tdGravedad);
            tr.appendChild(tdEstado);
            tr.appendChild(tdAccion);

            tbody.appendChild(tr);
        }

    } catch (err) {
        console.error("Error en cargarReportes:", err);
    }
}

// ========================================
// 2. ESTADÍSTICAS
// ========================================
async function cargarEstadisticas() {
    try {
        const { data: reportes, error } = await window.supabase
            .from("reportes")
            .select("estado");

        if (error) throw error;

        const total = reportes.length;
        const reportados = reportes.filter(r => r.estado === "reportado").length;
        const enRevision = reportes.filter(r => r.estado === "en_revision").length;
        const enProceso = reportes.filter(r => r.estado === "en_proceso").length;
        const solucionados = reportes.filter(r => r.estado === "solucionado").length;

        document.getElementById("total-reportes").textContent = total;
        document.getElementById("total-reportados").textContent = reportados;
        document.getElementById("total-revision").textContent = enRevision;
        document.getElementById("total-proceso").textContent = enProceso;
        document.getElementById("total-solucionados").textContent = solucionados;

    } catch (err) {
        console.error("Error en estadísticas:", err);
    }
}