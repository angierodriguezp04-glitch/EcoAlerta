// ========================================
// DASHBOARD COMPLETO (CORREGIDO)
// ========================================

document.addEventListener("DOMContentLoaded", async function() {
    if (typeof window.supabase === "undefined" || typeof window.supabase.from !== "function") {
        alert("❌ Error: Supabase no está inicializado.");
        console.error("Supabase no disponible en dashboard");
        return;
    }
    console.log("✅ Dashboard: Supabase conectado");

    await cargarReportes();
    await cargarEstadisticas();
    await cargarEstadoSensor();
});

// ========================================
// 1. Cargar reportes (con nombre de usuario)
// ========================================
async function cargarReportes() {
    try {
        const { data: reportes, error } = await window.supabase
            .from("reportes")
            .select(`
                *,
                usuarios ( nombre )
            `)
            .order("fecha_reporte", { ascending: false });

        if (error) {
            console.error("Error al cargar reportes:", error);
            return;
        }

        const tbody = document.getElementById("cuerpo-tabla");
        tbody.innerHTML = "";

        if (!reportes || reportes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px;">No hay reportes.</td></tr>`;
            return;
        }

        for (let reporte of reportes) {
            const tr = document.createElement("tr");

            // ID
            const tdId = document.createElement("td");
            tdId.textContent = reporte.id.slice(0, 8) + "…";
            tdId.style.fontSize = "12px";

            // Usuario
            const tdUsuario = document.createElement("td");
            tdUsuario.textContent = reporte.usuarios?.nombre || "Anónimo";

            // Ubicación
            const tdUbicacion = document.createElement("td");
            tdUbicacion.textContent = reporte.ubicacion || "N/A";

            // Dirección
            const tdDireccion = document.createElement("td");
            tdDireccion.textContent = reporte.direccion || "N/A";
            tdDireccion.style.maxWidth = "120px";

            // Tipo
            const tdTipo = document.createElement("td");
            tdTipo.textContent = reporte.tipo || "N/A";

            // Gravedad
            const tdGravedad = document.createElement("td");
            const gravedad = reporte.gravedad || "media";
            tdGravedad.textContent = gravedad.charAt(0).toUpperCase() + gravedad.slice(1);
            if (gravedad === "alta") tdGravedad.style.color = "#991b1b";
            else if (gravedad === "media") tdGravedad.style.color = "#854d0e";
            else tdGravedad.style.color = "#166534";

            // Estado
            const tdEstado = document.createElement("td");
            const estadoActual = reporte.estado || "reportado";
            const spanEstado = document.createElement("span");
            spanEstado.textContent = estadoActual.replace("_", " ").toUpperCase();
            spanEstado.className = `estado-${estadoActual}`;
            tdEstado.appendChild(spanEstado);

            // Acción: selector de estado
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

            // --- Evento change CORREGIDO ---
            select.addEventListener("change", async function(e) {
                // Guardamos el valor seleccionado y el ID del reporte
                const nuevoEstado = this.value;
                const reporteId = reporte.id;
                // Guardamos el estado actual para poder revertir si falla
                const estadoAnterior = estadoActual;

                if (!confirm(`¿Cambiar estado a "${nombres[nuevoEstado]}"?`)) {
                    this.value = estadoAnterior;
                    return;
                }

                try {
                    const { error } = await window.supabase
                        .from("reportes")
                        .update({ estado: nuevoEstado })
                        .eq("id", reporteId);

                    if (error) {
                        alert(`❌ Error: ${error.message}`);
                        this.value = estadoAnterior; // Revertir
                    } else {
                        alert("✅ Estado actualizado.");
                        // Recargar TODO para sincronizar
                        await cargarReportes();
                        await cargarEstadisticas();
                    }
                } catch (err) {
                    console.error(err);
                    alert("❌ Error inesperado.");
                    this.value = estadoAnterior;
                }
            });

            tdAccion.appendChild(select);
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
// 2. Cargar estadísticas
// ========================================
async function cargarEstadisticas() {
    try {
        const { data: reportes, error } = await window.supabase
            .from("reportes")
            .select("estado");

        if (error) throw error;

        const total = reportes.length;
        const solucionados = reportes.filter(r => r.estado === "solucionado").length;
        const pendientes = total - solucionados;

        document.getElementById("total-reportes").textContent = total;
        document.getElementById("total-solucionados").textContent = solucionados;
        document.getElementById("total-pendientes").textContent = pendientes;

    } catch (err) {
        console.error("Error en estadísticas:", err);
    }
}

// ========================================
// 3. Cargar estado del sensor (reemplazo del mapa)
// ========================================
async function cargarEstadoSensor() {
    const contenedor = document.getElementById("contenedor-sensor");
    if (!contenedor) return;

    try {
        // Obtener la última medición
        const { data: mediciones, error } = await window.supabase
            .from("mediciones")
            .select("valor, fecha_hora")
            .order("fecha_hora", { ascending: false })
            .limit(1);

        // Si la tabla no existe o no hay datos, manejarlo sin error
        if (error && error.code === "42P01") {
            // La tabla no existe
            contenedor.innerHTML = `
                <h2>📊 Estado del sensor</h2>
                <p>La tabla de mediciones aún no está creada.</p>
            `;
            return;
        }
        if (error) throw error;

        let html = `<h2>📊 Estado del sensor</h2>`;

        if (!mediciones || mediciones.length === 0) {
            html += `<p>No hay datos del sensor aún.</p>`;
        } else {
            const ultimo = mediciones[0];
            const nivel = ultimo.valor;
            const fecha = new Date(ultimo.fecha_hora).toLocaleString();
            const umbral = 2000; // Ajusta según tu sensor
            const estado = nivel > umbral ? "🚨 ALERTA" : "✅ Normal";

            html += `
                <div style="background:#f8fcfb; padding:20px; border-radius:16px;">
                    <p><strong>Nivel:</strong> ${nivel} (ADC)</p>
                    <p><strong>Estado:</strong> <span style="color: ${nivel > umbral ? '#991b1b' : '#166534'}; font-weight:bold;">${estado}</span></p>
                    <p><strong>Última medición:</strong> ${fecha}</p>
                </div>
            `;
        }

        // Historial reciente (últimas 10)
        const { data: historial, error: histError } = await window.supabase
            .from("mediciones")
            .select("valor, fecha_hora")
            .order("fecha_hora", { ascending: false })
            .limit(10);

        if (!histError && historial && historial.length > 0) {
            html += `<h3 style="margin-top:20px;">📈 Historial reciente</h3><ul style="list-style:none; padding:0;">`;
            for (let m of historial) {
                const fecha = new Date(m.fecha_hora).toLocaleString();
                html += `
                    <li style="background:white; padding:8px 14px; border-radius:8px; margin-bottom:6px; display:flex; justify-content:space-between;">
                        <span>${fecha}</span>
                        <span><strong>${m.valor}</strong></span>
                    </li>
                `;
            }
            html += `</ul>`;
        }

        contenedor.innerHTML = html;

    } catch (err) {
        console.error("Error cargando sensor:", err);
        contenedor.innerHTML = `
            <h2>📊 Estado del sensor</h2>
            <p style="color:red;">❌ Error al cargar datos del sensor. Asegúrate de que la tabla 'mediciones' exista.</p>
        `;
    }
}