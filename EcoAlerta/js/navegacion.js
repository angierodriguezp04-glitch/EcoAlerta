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
// NAVEGACIÓN COMPLETA ECOALERTA
// ========================================

// Respaldo: funciona aunque sensor.js no cargue
if (typeof escapeHtml !== "function") {
    window.escapeHtml = function (texto) {
        return String(texto ?? "")
            .replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    };
}

// ========================================
// DATOS DE LOCALIDADES Y BARRIOS
// ========================================
const LOCALIDADES = {
    "Usme": ["Monteblanco", "El Pedregal", "Brazuelos", "Cantarrana", "La Fiscala", "Alaska"],
    "Ciudad Bolívar": ["Meissen", "Villa Helena", "La Playa", "San Francisco", "Arborizadora Baja"],
    "Tunjuelito": ["Tunjuelito", "San Benito", "Villa Ximena", "Nuevo Muzú", "Rincón de Venecia", "Isla del Sol"],
    "Kennedy": ["Humedal Tingua Azul", "Humedal Meandro Media Luna", "Prados de Kennedy", "Class", "Class Roma", "Villa Rica", "Gran Britalia", "Nueva Roma", "Boitá", "Porvenir", "Santa Catalina", "El Rubí"],
    "Bosa": ["Villa del Río", "San Bernardino", "La Independencia", "La Paz Bosa", "Bosa Nova", "Los Sauces"]
};

const TIPOS_PROBLEMA = [
    "Mucha basura",
    "Vertimiento de residuos",
    "Actividad extraña",
    "Inundación",
    "Daño en el río",
    "Otros"
];

const MAX_EVIDENCIA_MB = 20;

// ========================================
// VARIABLES GLOBALES
// ========================================
let usuarioActual = null;
let detenerSensor = null;   // función para cancelar la suscripción al sensor

// ========================================
// SENSOR: iniciar / detener monitoreo
// ========================================
function detenerMonitoreoSensor() {
    if (detenerSensor) {
        detenerSensor();
        detenerSensor = null;
    }
}

function iniciarMonitoreoSensor() {
    detenerMonitoreoSensor();

    if (typeof window.supabase === "undefined" ||
        typeof suscribirLecturas !== "function" ||
        typeof renderTarjetaSensor !== "function") {
        const c = document.getElementById("sensor-container");
        if (c) c.innerHTML = `<p style="color:red;">❌ Sensor no disponible.</p>`;
        return;
    }

    detenerSensor = suscribirLecturas(function (lecturas, error) {
        const c = document.getElementById("sensor-container");
        if (!c) {              // el usuario cambió de sección
            detenerMonitoreoSensor();
            return;
        }
        c.innerHTML = renderTarjetaSensor(lecturas, error);
    });
}

// ========================================
// FUNCIÓN: Verificar sesión al cargar
// ========================================
async function verificarSesion() {
    if (typeof window.supabase === "undefined") {
        console.error("Supabase no disponible.");
        return;
    }
    const supabase = window.supabase;
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
        console.error("Error al obtener sesión:", error);
        return;
    }
    if (session) {
        usuarioActual = session.user;
        console.log("Usuario autenticado:", usuarioActual.email);
    } else {
        console.log("No hay sesión activa.");
    }
}

// ========================================
// MENÚ INFERIOR: marcar la opción activa
// ========================================
function marcarNavActivo(seccion) {
    document.querySelectorAll("nav button[data-seccion]").forEach(function (b) {
        b.classList.toggle("activo", b.dataset.seccion === seccion);
    });
}

// ========================================
// FUNCIÓN PRINCIPAL: mostrarSeccion
// ========================================
function mostrarSeccion(seccion) {
    const contenido = document.getElementById("contenido");
    marcarNavActivo(seccion);

    // Al cambiar de sección: detener sensor y restaurar el ancho normal
    detenerMonitoreoSensor();
    contenido.style.maxWidth = "";

    if (seccion === "inicio") {
        contenido.innerHTML = `
            <h2>Bienvenidos</h2>
            <p>Monitoreamos el río Tunjuelito en tiempo real y cada reporte ciudadano suma para protegerlo.</p>
            <button onclick="mostrarSeccion('perfil')" style="margin-top:20px;">Ir a mi perfil</button>
        `;
    }
    else if (seccion === "reportar") {
        if (!usuarioActual) {
            contenido.innerHTML = `
                <h2>📋 Reportar problema</h2>
                <p style="color: #991b1b;">⚠️ Debes iniciar sesión para reportar un problema.</p>
                <button onclick="mostrarSeccion('perfil')">Ir a Perfil</button>
                <button onclick="mostrarSeccion('inicio')">Volver al inicio</button>
            `;
            return;
        }

        let html = `
            <h2>📋 Reportar problema</h2>
            <p>Selecciona la ubicación y describe lo que está ocurriendo.</p>

            <form id="formReporte">
                <label for="localidad">Localidad *</label>
                <select id="localidad" required>
                    <option value="">-- Selecciona una localidad --</option>
        `;
        for (let loc in LOCALIDADES) {
            html += `<option value="${loc}">${loc}</option>`;
        }
        html += `
                </select>

                <label for="barrio">Barrio *</label>
                <select id="barrio" required>
                    <option value="">-- Primero selecciona una localidad --</option>
                </select>

                <label for="direccion">Dirección (opcional)</label>
                <input type="text" id="direccion" placeholder="Calle, carrera, conjunto...">

                <label for="tipo">Tipo de problema *</label>
                <select id="tipo" required>
                    <option value="">-- Selecciona un tipo --</option>
        `;
        for (let tipo of TIPOS_PROBLEMA) {
            html += `<option value="${tipo}">${tipo}</option>`;
        }
        html += `
                </select>

                <label for="gravedad">Gravedad</label>
                <select id="gravedad">
                    <option value="baja">Baja</option>
                    <option value="media" selected>Media</option>
                    <option value="alta">Alta</option>
                </select>

                <label for="descripcion">Descripción (opcional)</label>
                <textarea id="descripcion" rows="4" placeholder="Cuéntanos más detalles..."></textarea>

                <label for="evidencia">📷 Foto o video (opcional, máx. ${MAX_EVIDENCIA_MB} MB)</label>
                <input type="file" id="evidencia" accept="image/*,video/*">

                <button type="submit" id="btnEnviarReporte">Enviar reporte</button>
            </form>

            <button onclick="mostrarSeccion('inicio')" style="margin-top:12px;">Volver al inicio</button>
        `;

        contenido.innerHTML = html;

        const selectLocalidad = document.getElementById("localidad");
        const selectBarrio = document.getElementById("barrio");

        selectLocalidad.addEventListener("change", function() {
            const localidadSeleccionada = this.value;
            selectBarrio.innerHTML = '<option value="">-- Selecciona un barrio --</option>';

            if (localidadSeleccionada && LOCALIDADES[localidadSeleccionada]) {
                for (let barrio of LOCALIDADES[localidadSeleccionada]) {
                    const option = document.createElement("option");
                    option.value = barrio;
                    option.textContent = barrio;
                    selectBarrio.appendChild(option);
                }
            }
        });

        document.getElementById("formReporte").addEventListener("submit", async function(event) {
            event.preventDefault();

            const localidad = document.getElementById("localidad").value;
            const barrio = document.getElementById("barrio").value;
            const direccion = document.getElementById("direccion").value.trim();
            const tipo = document.getElementById("tipo").value;
            const gravedad = document.getElementById("gravedad").value;
            const descripcion = document.getElementById("descripcion").value;
            const archivo = document.getElementById("evidencia").files[0];
            const btn = document.getElementById("btnEnviarReporte");

            if (!localidad || !barrio || !tipo) {
                alert("Por favor, completa los campos obligatorios (localidad, barrio y tipo).");
                return;
            }

            if (typeof window.supabase === "undefined") {
                alert("❌ Error: Supabase no está configurado.");
                return;
            }
            const supabase = window.supabase;

            if (archivo && archivo.size > MAX_EVIDENCIA_MB * 1024 * 1024) {
                alert(`⚠️ El archivo supera los ${MAX_EVIDENCIA_MB} MB. Elige uno más liviano.`);
                return;
            }

            btn.disabled = true;
            btn.textContent = "Enviando...";

            try {
                let evidenciaUrl = null;
                let evidenciaTipo = null;

                // 1. Subir foto/video (si hay)
                if (archivo) {
                    const ext = (archivo.name.split(".").pop() || "bin")
                        .toLowerCase().replace(/[^a-z0-9]/g, "");
                    const ruta = `${usuarioActual.id}/${Date.now()}.${ext}`;

                    const { error: errSubida } = await supabase.storage
                        .from("evidencias")
                        .upload(ruta, archivo, { contentType: archivo.type });

                    if (errSubida) {
                        console.error("Error subiendo archivo:", errSubida);
                        alert(`❌ No se pudo subir el archivo: ${errSubida.message}`);
                        return;
                    }

                    const { data: pub } = supabase.storage.from("evidencias").getPublicUrl(ruta);
                    evidenciaUrl = pub.publicUrl;
                    evidenciaTipo = archivo.type.startsWith("video") ? "video" : "imagen";
                }

                // 2. Guardar el reporte
                const reporte = {
                    usuario_id: usuarioActual.id,
                    tipo: tipo,
                    descripcion: descripcion || null,
                    ubicacion: `${localidad} - ${barrio}`,
                    direccion: direccion || null,
                    latitud: null,
                    longitud: null,
                    gravedad: gravedad,
                    estado: "reportado",
                    evidencia_url: evidenciaUrl,
                    evidencia_tipo: evidenciaTipo
                };

                const { error } = await supabase.from("reportes").insert([reporte]);

                if (error) {
                    console.error("Error de Supabase:", error);
                    alert(`❌ Error al guardar: ${error.message}`);
                } else {
                    alert("✅ ¡Reporte enviado con éxito! Gracias por ayudar al río.");
                    document.getElementById("formReporte").reset();
                    selectBarrio.innerHTML = '<option value="">-- Primero selecciona una localidad --</option>';
                }
            } catch (err) {
                console.error("Error inesperado:", err);
                alert(`❌ Error inesperado: ${err.message}`);
            } finally {
                btn.disabled = false;
                btn.textContent = "Enviar reporte";
            }
        });
    }
    else if (seccion === "alertas") {
        contenido.innerHTML = `
            <h2>🚨 Alertas</h2>
            <p>Estado actual del río y de tus reportes.</p>

            <div id="sensor-container"><p>Cargando estado del río...</p></div>

            <div id="alertas-container">
                <p>Cargando tus reportes...</p>
            </div>
            <button onclick="mostrarSeccion('inicio')" style="margin-top:16px;">Volver al inicio</button>
        `;
        iniciarMonitoreoSensor();
        cargarAlertasUsuario();
    }
    else if (seccion === "jugar") {
        // Ampliar el contenedor solo para el juego
        contenido.style.maxWidth = "1100px";

        contenido.innerHTML = `
            <h2>🎮 Rescate Río Tunjuelito</h2>
            <p>¡Ayuda a nuestro explorador a limpiar el río!</p>

            <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-bottom:14px;">
                <button onclick="abrirJuegoPantallaCompleta()" style="background:#1a4d4e; color:white;">
                    🖥️ Pantalla completa
                </button>
                <button onclick="window.open('https://angierodriguezp04-glitch.github.io/Rescate_Rio-Tunjuelito/', '_blank')">
                    🔗 Abrir en pestaña nueva
                </button>
            </div>

            <div id="contenedorJuego" style="width: 100%; height: 85vh; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 14px rgba(0,0,0,0.08); background:#000;">
                <iframe
                    id="iframeJuego"
                    src="https://angierodriguezp04-glitch.github.io/Rescate_Rio-Tunjuelito/"
                    style="width: 100%; height: 100%; border: none;"
                    allowfullscreen
                ></iframe>
            </div>

            <button onclick="mostrarSeccion('inicio')" style="margin-top:14px;">Volver al inicio</button>
        `;
    }
    else if (seccion === "perfil") {
        mostrarPerfil();
    }
}

// ========================================
// FUNCIÓN: Pantalla completa del juego
// ========================================
function abrirJuegoPantallaCompleta() {
    const cont = document.getElementById("contenedorJuego");
    if (!cont) return;
    if (cont.requestFullscreen) cont.requestFullscreen();
    else if (cont.webkitRequestFullscreen) cont.webkitRequestFullscreen();
}

// ========================================
// FUNCIÓN: Cargar reportes del usuario (con estado y evidencia)
// ========================================
async function cargarAlertasUsuario() {
    const container = document.getElementById("alertas-container");
    if (!container) return;

    if (!usuarioActual) {
        container.innerHTML = `<p style="color: #991b1b;">⚠️ Inicia sesión para ver tus reportes.</p>`;
        return;
    }

    if (typeof window.supabase === "undefined") {
        container.innerHTML = `<p style="color: red;">❌ Error: Supabase no disponible.</p>`;
        return;
    }
    const supabase = window.supabase;

    try {
        const { data: reportes, error } = await supabase
            .from("reportes")
            .select("*")
            .eq("usuario_id", usuarioActual.id)
            .order("fecha_reporte", { ascending: false });

        if (error) throw error;

        if (!reportes || reportes.length === 0) {
            container.innerHTML = `<p>No has enviado ningún reporte aún.</p>`;
            return;
        }

        const nombresEstados = {
            "reportado": "🔴 Reportado",
            "en_revision": "🟡 En revisión",
            "en_proceso": "🔵 En proceso",
            "solucionado": "🟢 Solucionado"
        };

        let html = `<h3 style="text-align:left; margin-bottom:14px; color:#1a4d4e;">📋 Tus reportes (${reportes.length})</h3>`;

        for (let r of reportes) {
            const estadoTexto = nombresEstados[r.estado] || escapeHtml((r.estado || "").toUpperCase());
            const claseEstado = `estado-${escapeHtml(r.estado || "reportado")}`;
            const fecha = new Date(r.fecha_reporte).toLocaleString("es-CO", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            });

            let evidenciaHtml = "";
            if (r.evidencia_url) {
                evidenciaHtml = r.evidencia_tipo === "video"
                    ? `<video src="${escapeHtml(r.evidencia_url)}" controls style="width:100%; border-radius:10px; margin-top:8px;"></video>`
                    : `<img src="${escapeHtml(r.evidencia_url)}" alt="Evidencia" style="width:100%; border-radius:10px; margin-top:8px;">`;
            }

            html += `
                <div class="tarjeta-reporte">
                    <strong>${escapeHtml(r.tipo)}</strong>
                    <div class="fila-info">📍 <strong>Ubicación:</strong> ${escapeHtml(r.ubicacion || "N/A")}</div>
                    ${r.direccion ? `<div class="fila-info">🏠 <strong>Dirección:</strong> ${escapeHtml(r.direccion)}</div>` : ""}
                    <div class="fila-info">⚠️ <strong>Gravedad:</strong> ${escapeHtml(r.gravedad || "media")}</div>
                    ${r.descripcion ? `<div class="fila-info">📝 ${escapeHtml(r.descripcion)}</div>` : ""}
                    ${evidenciaHtml}
                    <div style="margin-top:10px;">
                        <span class="estado-badge ${claseEstado}">${estadoTexto}</span>
                    </div>
                    <span class="fecha">🕐 ${fecha}</span>
                </div>
            `;
        }

        container.innerHTML = html;

    } catch (err) {
        console.error("Error cargando alertas:", err);
        container.innerHTML = `<p style="color: red;">❌ Error al cargar tus reportes.</p>`;
    }
}

// ========================================
// FUNCIÓN: Mostrar perfil
// ========================================
function mostrarPerfil() {
    marcarNavActivo("perfil");
    detenerMonitoreoSensor();
    const contenido = document.getElementById("contenido");
    contenido.style.maxWidth = "";

    if (usuarioActual) {
        contenido.innerHTML = `
            <div class="perfil">
                <div class="icono-perfil" style="font-size:60px;">👤</div>
                <h2>Mi perfil</h2>
                <p><strong>Nombre:</strong> ${escapeHtml(usuarioActual.user_metadata?.nombre || "Sin nombre")}</p>
                <p><strong>Correo:</strong> ${escapeHtml(usuarioActual.email)}</p>
                <button onclick="cerrarSesion()">Cerrar sesión</button>
                <button onclick="mostrarSeccion('inicio')">Volver al inicio</button>
            </div>
        `;
    } else {
        contenido.innerHTML = `
            <div class="perfil">
                <div class="icono-perfil" style="font-size:60px;">👤</div>
                <h2>Mi perfil</h2>
                <p>Aún no has iniciado sesión.</p>
                <button onclick="mostrarRegistro()">Crear cuenta</button>
                <button onclick="mostrarLogin()">Iniciar sesión</button>
                <button onclick="mostrarSeccion('inicio')">Volver al inicio</button>
            </div>
        `;
    }
}

// ========================================
// REGISTRO REAL
// ========================================
function mostrarRegistro() {
    marcarNavActivo("perfil");
    detenerMonitoreoSensor();
    const contenido = document.getElementById("contenido");
    contenido.innerHTML = `
        <div class="registro">
            <h2>Crear cuenta</h2>
            <p>Regístrate para utilizar EcoAlerta.</p>
            <form id="formRegistro">
                <label for="nombre">Nombre</label>
                <input type="text" id="nombre" placeholder="Escribe tu nombre" required>
                <label for="correo">Correo electrónico</label>
                <input type="email" id="correo" placeholder="ejemplo@correo.com" required>
                <label for="contrasena">Contraseña</label>
                <input type="password" id="contrasena" placeholder="Crea una contraseña" required>
                <button type="submit">Crear cuenta</button>
            </form>
            <button onclick="mostrarSeccion('perfil')">Volver</button>
        </div>
    `;

    document.getElementById("formRegistro").addEventListener("submit", async function(event) {
        event.preventDefault();

        const nombre = document.getElementById("nombre").value;
        const correo = document.getElementById("correo").value;
        const contrasena = document.getElementById("contrasena").value;

        if (!nombre || !correo || !contrasena) {
            alert("Por favor, completa todos los campos.");
            return;
        }

        if (typeof window.supabase === "undefined") {
            alert("❌ Error: Supabase no está configurado.");
            return;
        }
        const supabase = window.supabase;

        try {
            const { data, error } = await supabase.auth.signUp({
                email: correo,
                password: contrasena,
                options: {
                    data: { nombre: nombre }
                }
            });

            if (error) {
                console.error("Error en signUp:", error);
                if (error.message.includes("User already registered")) {
                    alert("⚠️ Este correo ya está registrado. Por favor, inicia sesión.");
                    mostrarLogin();
                } else {
                    alert(`❌ Error al registrar: ${error.message}`);
                }
                return;
            }

            if (!data.user) {
                alert("❌ Error: No se pudo crear el usuario.");
                return;
            }

            const { error: insertError } = await supabase
                .from("usuarios")
                .insert([
                    { id: data.user.id, nombre: nombre, correo: correo }
                ]);

            if (insertError) {
                console.error("Error al insertar en 'usuarios':", insertError);
                alert("⚠️ Cuenta creada, pero hubo un problema al guardar datos adicionales. Contacta al administrador.");
            } else {
                alert("✅ Cuenta creada con éxito. ¡Ya puedes iniciar sesión!");
            }

            usuarioActual = data.user;
            mostrarPerfil();

        } catch (err) {
            console.error("Error inesperado:", err);
            alert(`❌ Error inesperado: ${err.message}`);
        }
    });
}

// ========================================
// LOGIN REAL
// ========================================
function mostrarLogin() {
    marcarNavActivo("perfil");
    detenerMonitoreoSensor();
    const contenido = document.getElementById("contenido");
    contenido.innerHTML = `
        <div class="login">
            <h2>Iniciar sesión</h2>
            <p>Ingresa a tu cuenta de EcoAlerta.</p>
            <form id="formLogin">
                <label for="loginCorreo">Correo electrónico</label>
                <input type="email" id="loginCorreo" placeholder="ejemplo@correo.com" required>
                <label for="loginContrasena">Contraseña</label>
                <input type="password" id="loginContrasena" placeholder="Tu contraseña" required>
                <button type="submit">Iniciar sesión</button>
            </form>
            <button onclick="mostrarSeccion('perfil')">Volver</button>
        </div>
    `;

    document.getElementById("formLogin").addEventListener("submit", async function(event) {
        event.preventDefault();

        const correo = document.getElementById("loginCorreo").value;
        const contrasena = document.getElementById("loginContrasena").value;

        if (!correo || !contrasena) {
            alert("Por favor, completa ambos campos.");
            return;
        }

        if (typeof window.supabase === "undefined") {
            alert("❌ Error: Supabase no está configurado.");
            return;
        }
        const supabase = window.supabase;

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: correo,
                password: contrasena
            });

            if (error) {
                console.error("Error en login:", error);
                alert(`❌ Error al iniciar sesión: ${error.message}`);
                return;
            }

            if (!data.user) {
                alert("❌ No se pudo obtener la información del usuario.");
                return;
            }

            usuarioActual = data.user;
            alert("✅ Sesión iniciada correctamente.");
            mostrarPerfil();

        } catch (err) {
            console.error("Error inesperado:", err);
            alert(`❌ Error inesperado: ${err.message}`);
        }
    });
}

// ========================================
// CERRAR SESIÓN
// ========================================
async function cerrarSesion() {
    if (typeof window.supabase === "undefined") {
        alert("❌ Error: Supabase no está configurado.");
        return;
    }
    const supabase = window.supabase;

    try {
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error("Error al cerrar sesión:", error);
            alert(`❌ Error al cerrar sesión: ${error.message}`);
        } else {
            usuarioActual = null;
            alert("✅ Sesión cerrada correctamente.");
            mostrarPerfil();
        }
    } catch (err) {
        console.error("Error inesperado:", err);
        alert(`❌ Error inesperado: ${err.message}`);
    }
}

// ========================================
// EJECUTAR AL CARGAR LA PÁGINA
// ========================================
document.addEventListener("DOMContentLoaded", async function() {
    try {
        await verificarSesion();
    } catch (e) {
        console.error("Error verificando sesión:", e);
    }
    mostrarSeccion("inicio");   // así el estado del río aparece desde el inicio
});