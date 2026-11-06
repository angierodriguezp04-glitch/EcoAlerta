// ========================================
// SENSOR DE NIVEL DEL RÍO (compartido por app y dashboard)
// ========================================

const SENSOR_CONFIG = {
    tabla: "lecturas_sensor",
    umbrales: { precaucion: 25, alerta: 50, critico: 75 }, // % del nivel
    segundosOffline: 90,   // si no llega lectura en este tiempo → "sin conexión"
    pollingMs: 10000,      // refresco de respaldo
    historial: 30          // lecturas para la gráfica
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
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
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

// Devuelve las últimas N lecturas (la más reciente primero)
async function obtenerLecturas(n) {
    const { data, error } = await window.supabase
        .from(SENSOR_CONFIG.tabla)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(n);
    if (error) throw error;
    return data || [];
}

// Se suscribe a lecturas nuevas (tiempo real + respaldo por polling).
// callback(lecturasDesc, error). Devuelve una función para detener todo.
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

// HTML de la tarjeta de estado del río
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

console.log("✅ sensor.js cargado correctamente.");