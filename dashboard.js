// ========================================
// SENSOR DE NIVEL DEL RÍO (incrustado: no requiere sensor.js)
// ========================================
(function () {
    if (typeof window.suscribirLecturas === "function" &&
        typeof window.renderTarjetaSensor === "function") {
        return; // ya cargado desde sensor.js
    }

    const SENSOR_CONFIG = {
        tabla: "lecturas_sensor",
        umbrales: { precaucion: 25, alerta: 50, critico: 75 }, // % del nivel
        segundosOffline: 90,
        pollingMs: 10000,
        historial: 30
    };

    const NIVELES = {
        normal:     { texto: "Normal",         emoji: "🟢", mensaje: "El nivel del río es normal." },
        precaucion: { texto: "Precaución",     emoji: "🟡", mensaje: "El nivel del río está subiendo. Mantente atento." },
        alerta:     { texto: "Alerta",         emoji: "🟠", mensaje: "Nivel alto. Evita acercarte al río y a zonas bajas." },
        critico:    { texto: "Riesgo crítico", emoji: "🔴", mensaje: "¡Riesgo de inundación! Aléjate de la ronda del río y sigue las indicaciones de las autoridades." },
        offline:    { texto: "Sin conexión",   emoji: "⚪", mensaje: "El sensor no está enviando datos en este momento." }
    };

    function escapeHtml(texto) {
        return String(texto ?? "")
            .replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function clasificarNivel(porcentaje) {
        const u = SENSOR_CONFIG.umbrales;
        if (porcentaje >= u.critico) return "critico";
        if (porcentaje >= u.alerta) return "alerta";
        if (porcentaje >= u.precaucion) return "precaucion";
        return "normal";
    }

    function estadoDeLectura(lectura) {
        if (!lectura) return "offline";
        const edad = (Date.now() - new Date(lectura.created_at).getTime()) / 1000;
        if (edad > SENSOR_CONFIG.segundosOffline) return "offline";
        return clasificarNivel(Number(lectura.nivel_porcentaje));
    }

    function tiempoRelativo(iso) {
        const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
        if (s < 60) return `hace ${s} s`;
        const m = Math.floor(s / 60);
        if (m < 60) return `hace ${m} min`;
        const h = Math.floor(m / 60);
        if (h < 24) return `hace ${h} h`;
        return `hace ${Math.floor(h / 24)} d`;
    }

    async function obtenerLecturas(n) {
        const { data, error } = await window.supabase
            .from(SENSOR_CONFIG.tabla)
            .select("*")
            .order("created_at", { ascending: false })
            .limit(n);
        if (error) throw error;
        return data || [];
    }

    function suscribirLecturas(callback) {
        let activo = true;
        let debounce = null;

        const refrescar = async () => {
            if (!activo) return;
            try {
                const lecturas = await obtenerLecturas(SENSOR_CONFIG.historial);
                if (activo) callback(lecturas, null);
            } catch (e) {
                console.error("Error leyendo sensor:", e);
                if (activo) callback(null, e);
            }
        };

        refrescar();
        const poll = setInterval(refrescar, SENSOR_CONFIG.pollingMs);

        let canal = null;
        try {
            canal = window.supabase
                .channel("lecturas-" + Math.random().toString(36).slice(2))
                .on("postgres_changes",
                    { event: "INSERT", schema: "public", table: SENSOR_CONFIG.tabla },
                    () => {
                        clearTimeout(debounce);
                        debounce = setTimeout(refrescar, 500);
                    })
                .subscribe();
        } catch (e) {
            console.warn("Realtime no disponible, se usa solo polling:", e);
        }

        return function detener() {
            activo = false;
            clearInterval(poll);
            clearTimeout(debounce);
            if (canal) window.supabase.removeChannel(canal);
        };
    }

    function renderSparkline(lecturasDesc) {
        if (!lecturasDesc || lecturasDesc.length < 2) return "";
        const datos = [...lecturasDesc].reverse().map(l => Number(l.nivel_porcentaje));
        const W = 300, H = 60, pad = 4;
        const paso = (W - pad * 2) / (datos.length - 1);
        const puntos = datos.map((v, i) => {
            const x = pad + i * paso;
            const y = H - pad - (v / 100) * (H - pad * 2);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(" ");
        return `<svg class="sensor-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
                    <polyline points="${puntos}"></polyline>
                </svg>`;
    }

    function renderTarjetaSensor(lecturasDesc, error, opciones) {
    // opciones.sinMensaje = true -> oculta los avisos para ciudadanos (uso en dashboard)
    opciones = opciones || {};
        if (error) {
            return `<div class="sensor-card nivel-offline">
                        <div class="sensor-titulo">📡 Nivel del río en tiempo real</div>
                        <div class="sensor-msg">❌ No se pudo consultar el sensor.</div>
                    </div>`;
        }

        const ultima = lecturasDesc && lecturasDesc[0];
        const estado = estadoDeLectura(ultima);
        const info = NIVELES[estado];

        if (!ultima) {
            return `<div class="sensor-card nivel-offline">
                        <div class="sensor-titulo">📡 Nivel del río en tiempo real</div>
                        <span class="sensor-estado">${info.emoji} ${info.texto}</span>
                        <div class="sensor-msg">Aún no hay datos del sensor.</div>
                    </div>`;
        }

        const pct = Number(ultima.nivel_porcentaje);
        return `
            <div class="sensor-card nivel-${estado}">
                <div class="sensor-titulo">📡 Nivel del río en tiempo real</div>
                <span class="sensor-estado">${info.emoji} ${info.texto}</span>
                <div class="sensor-pct">${pct.toFixed(0)}%</div>
                <div class="sensor-barra"><div class="sensor-barra-relleno" style="width:${pct}%"></div></div>
                ${(opciones.sinMensaje && estado !== "offline") ? "" : `<div class="sensor-msg">${info.mensaje}</div>`}
                ${renderSparkline(lecturasDesc)}
                <div class="sensor-meta">
                    Última lectura ${tiempoRelativo(ultima.created_at)} · Sensor: ${escapeHtml(ultima.sensor_id)}
                </div>
            </div>`;
    }

    // Exponer a todo el resto del código
    window.SENSOR_CONFIG = SENSOR_CONFIG;
    window.NIVELES = NIVELES;
    window.escapeHtml = escapeHtml;
    window.clasificarNivel = clasificarNivel;
    window.suscribirLecturas = suscribirLecturas;
    window.renderTarjetaSensor = renderTarjetaSensor;

    console.log("✅ Sensor incrustado cargado correctamente.");
})();

// ========================================
// DASHBOARD ECOALERTA - con sensor en tiempo real
// (los reportes cargan primero y NO dependen del sensor)
// ========================================

document.addEventListener("DOMContentLoaded", async function () {
    if (typeof window.supabase === "undefined" || typeof window.supabase.from !== "function") {
        alert("❌ Error: Supabase no está inicializado.");
        console.error("Supabase no disponible en dashboard");
        return;
    }
    console.log("✅ Dashboard conectado a Supabase");

    // 1. Reportes y estadísticas primero
    await cargarReportes();
    await cargarEstadisticas();

    // 2. Sensor después, protegido para que nunca rompa lo anterior
    try {
        iniciarPanelSensor();
    } catch (e) {
        console.error("Error iniciando el sensor:", e);
        const c = document.getElementById("sensor-container");
        if (c) c.innerHTML = `<p style="color:red;">❌ Sensor no disponible (revisa que js/sensor.js exista y esté en dashboard.html).</p>`;
    }
});

// ========================================
// 0. SENSOR EN TIEMPO REAL
// ========================================
function iniciarPanelSensor() {
    if (typeof suscribirLecturas !== "function" || typeof renderTarjetaSensor !== "function") {
        const c = document.getElementById("sensor-container");
        if (c) c.innerHTML = `<p style="color:red;">❌ Sensor no disponible: no se cargó js/sensor.js.</p>`;
        const t = document.getElementById("cuerpo-lecturas");
        if (t) t.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#6f8f90;">Sin datos.</td></tr>`;
        console.error("sensor.js no está cargado: faltan suscribirLecturas / renderTarjetaSensor.");
        return;
    }

    suscribirLecturas(function (lecturas, error) {
        // Tarjeta principal
        const c = document.getElementById("sensor-container");
        if (c) c.innerHTML = renderTarjetaSensor(lecturas, error, { sinMensaje: true });

        // Tabla de últimas lecturas
        const tbody = document.getElementById("cuerpo-lecturas");
        if (!tbody) return;

        if (error || !lecturas || lecturas.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#6f8f90;">Sin lecturas aún.</td></tr>`;
            return;
        }

        let html = "";
        for (let l of lecturas.slice(0, 15)) {
            const nivel = clasificarNivel(Number(l.nivel_porcentaje));
            const info = NIVELES[nivel];
            const fecha = new Date(l.created_at).toLocaleString("es-CO", {
                day: "2-digit", month: "short",
                hour: "2-digit", minute: "2-digit", second: "2-digit"
            });
            html += `
                <tr>
                    <td>${fecha}</td>
                    <td>${escapeHtml(l.sensor_id)}</td>
                    <td>${l.nivel_raw}</td>
                    <td><strong>${Number(l.nivel_porcentaje).toFixed(1)}%</strong></td>
                    <td>${info.emoji} ${info.texto}</td>
                </tr>`;
        }
        tbody.innerHTML = html;
    });
}

// ========================================
// 1. CARGAR REPORTES (con nombre de usuario y evidencia)
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
                evidencia_url,
                evidencia_tipo,
                usuarios ( nombre, correo )
            `)
            .order("fecha_reporte", { ascending: false });

        if (error) {
            console.error("Error al cargar reportes:", error);
            const tb = document.getElementById("cuerpo-tabla");
            if (tb) tb.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px; color:#991b1b;">❌ Error al cargar reportes: ${error.message}</td></tr>`;
            return;
        }

        const tbody = document.getElementById("cuerpo-tabla");
        tbody.innerHTML = "";

        if (!reportes || reportes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px; color:#6f8f90;">No hay reportes aún.</td></tr>`;
            return;
        }

        for (let reporte of reportes) {
            const tr = document.createElement("tr");

            // ---- ID (corto) ----
            const tdId = document.createElement("td");
            tdId.textContent = String(reporte.id).slice(0, 8) + "…";
            tdId.style.fontSize = "12px";
            tdId.style.color = "#4a6b6c";

            // ---- Usuario ----
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

            // ---- Descripción ----
            const tdDescripcion = document.createElement("td");
            tdDescripcion.textContent = reporte.descripcion || "Sin descripción";
            tdDescripcion.style.minWidth = "180px";
            tdDescripcion.style.maxWidth = "260px";
            tdDescripcion.style.wordBreak = "break-word";
            if (!reporte.descripcion) {
                tdDescripcion.style.color = "#8ba5a6";
                tdDescripcion.style.fontStyle = "italic";
            }

            // ---- Evidencia ----
            const tdEvidencia = document.createElement("td");
            if (reporte.evidencia_url) {
                const enlace = document.createElement("a");
                enlace.href = reporte.evidencia_url;
                enlace.target = "_blank";
                enlace.rel = "noopener noreferrer";
                enlace.textContent = reporte.evidencia_tipo === "video" ? "🎥 Ver video" : "🖼️ Ver foto";
                enlace.style.color = "#2c7a7b";
                enlace.style.fontWeight = "600";
                tdEvidencia.appendChild(enlace);
            } else {
                tdEvidencia.textContent = "—";
            }

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

            select.addEventListener("change", async function () {
                const nuevoEstado = this.value;
                const estadoAnterior = reporte.estado || "reportado";
                const reporteId = reporte.id;
                const selectRef = this;

                if (!confirm(`¿Cambiar estado a "${nombres[nuevoEstado]}"?`)) {
                    selectRef.value = estadoAnterior;
                    return;
                }

                selectRef.disabled = true;

                try {
                    const { error } = await window.supabase
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

                    spanEstado.textContent = nuevoEstado.replace("_", " ").toUpperCase();
                    spanEstado.className = `estado-${nuevoEstado}`;
                    reporte.estado = nuevoEstado;

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

            tr.appendChild(tdId);
            tr.appendChild(tdUsuario);
            tr.appendChild(tdUbicacion);
            tr.appendChild(tdDireccion);
            tr.appendChild(tdTipo);
            tr.appendChild(tdDescripcion);
            tr.appendChild(tdEvidencia);
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


// ========================================
// 3. NAVEGACIÓN ENTRE VISTAS (Sensor / Reportes)
// ========================================
function mostrarVista(nombre) {
    const menu = document.getElementById("menu-principal");
    const vSensor = document.getElementById("vista-sensor");
    const vReportes = document.getElementById("vista-reportes");

    menu.style.display = nombre === "menu" ? "" : "none";
    vSensor.style.display = nombre === "sensor" ? "" : "none";
    vReportes.style.display = nombre === "reportes" ? "" : "none";
    window.scrollTo({ top: 0, behavior: "smooth" });
}