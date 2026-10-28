// ========================================
// NAVEGACIÓN COMPLETA ECOALERTA
// ========================================

// ========================================
// CONFIGURACIÓN (cambia aquí lo que necesites para el video)
// ========================================
const ALERTA_SIMULADA_ACTIVA = true;          // Alerta de prueba a los 15 s de abrir la app
const ESCUCHAR_SENSOR_REALTIME = true;        // Poner en false si NO quieres alertas por mediciones del dashboard
const UMBRAL_ALERTA = 2000;                   // Mismo umbral que el ESP32 y el dashboard
const PAUSA_ENTRE_ALERTAS_MS = 5 * 60 * 1000; // 5 minutos entre alertas del sensor
const ICONO_NOTIFICACION = "file.jpg";        // Tu logo (en index.html es file.jpg)

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

// ========================================
// VARIABLES GLOBALES
// ========================================
let usuarioActual = null;
let alertaSimuladaActiva = false;   // (antes estaba al final del archivo)
let seccionActual = "inicio";
let ultimaAlertaSensor = 0;

// ========================================
// UTILIDADES
// ========================================

// Evita que texto escrito por usuarios se interprete como HTML
function escaparHTML(texto) {
    if (texto === null || texto === undefined) return "";
    return String(texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Notificación del sistema, segura (no rompe la app si el navegador no la soporta)
function mostrarNotificacion(titulo, cuerpo) {
    try {
        if ("Notification" in window && Notification.permission === "granted") {
            new Notification(titulo, { body: cuerpo, icon: ICONO_NOTIFICACION });
        }
    } catch (e) {
        console.warn("Notificación no soportada en este dispositivo:", e);
    }
}

// Aviso dentro de la app (no bloquea la pantalla como alert())
function mostrarBannerAlerta(mensaje) {
    const anterior = document.getElementById("banner-alerta");
    if (anterior) anterior.remove();

    const banner = document.createElement("div");
    banner.id = "banner-alerta";
    banner.style.cssText = `
        position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
        width: 92%; max-width: 460px; z-index: 1000;
        background: #fee2e2; color: #7f1d1d; border-left: 6px solid #991b1b;
        padding: 14px 16px; border-radius: 14px; text-align: left;
        box-shadow: 0 8px 24px rgba(153, 27, 27, 0.25); font-size: 14px;
    `;
    banner.innerHTML = `
        <strong style="color:#991b1b;">🚨 ALERTA ECOALERTA</strong><br>
        ${escaparHTML(mensaje)}
        <button id="cerrar-banner" style="float:right; padding:2px 10px; margin-top:-22px; background:none; color:#991b1b; font-size:18px;">✕</button>
    `;
    document.body.appendChild(banner);
    document.getElementById("cerrar-banner").addEventListener("click", () => banner.remove());
    setTimeout(() => { if (banner.parentNode) banner.remove(); }, 12000);
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
        if (seccionActual === "perfil") {
            mostrarPerfil();
        }
    } else {
        console.log("No hay sesión activa.");
    }
}

// ========================================
// FUNCIÓN PRINCIPAL: mostrarSeccion
// ========================================
function mostrarSeccion(seccion) {
    const contenido = document.getElementById("contenido");
    seccionActual = seccion;

    // Restablecer el ancho (el juego lo amplía)
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

                <label for="evidencia">Adjuntar foto o video (opcional)</label>
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
                const barrios = LOCALIDADES[localidadSeleccionada];
                for (let barrio of barrios) {
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

            if (!localidad || !barrio || !tipo) {
                alert("Por favor, completa los campos obligatorios (localidad, barrio y tipo).");
                return;
            }

            if (typeof window.supabase === "undefined") {
                alert("❌ Error: Supabase no está configurado.");
                return;
            }
            const supabase = window.supabase;

            const btnEnviar = document.getElementById("btnEnviarReporte");
            btnEnviar.disabled = true;
            btnEnviar.textContent = "Enviando...";

            try {
                // ----------------------------------------
                // SUBIR EVIDENCIA (foto o video) - opcional
                // ----------------------------------------
                const archivo = document.getElementById("evidencia").files[0];
                let fotoUrl = null;

                if (archivo) {
                    const nombreSeguro = archivo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
                    const nombreArchivo = `${Date.now()}_${nombreSeguro}`;

                    const { error: uploadError } = await supabase.storage
                        .from("evidencias")
                        .upload(nombreArchivo, archivo);

                    if (uploadError) {
                        console.error("Error al subir archivo:", uploadError);
                        alert("❌ Error al subir el archivo: " + uploadError.message);
                        return;
                    }

                    const { data: urlData } = supabase.storage
                        .from("evidencias")
                        .getPublicUrl(nombreArchivo);

                    fotoUrl = urlData.publicUrl;
                }

                const reporte = {
                    usuario_id: usuarioActual.id,
                    tipo: tipo,
                    descripcion: descripcion || null,
                    ubicacion: `${localidad} - ${barrio}`,
                    direccion: direccion || null,
                    foto_url: fotoUrl,
                    latitud: null,
                    longitud: null,
                    gravedad: gravedad,
                    estado: "reportado"
                };

                const { error } = await supabase
                    .from("reportes")
                    .insert([reporte]);

                if (error) {
                    console.error("Error de Supabase:", error);
                    alert(`❌ Error al guardar: ${error.message}`);
                } else {
                    alert("✅ ¡Reporte enviado con éxito! Gracias por ayudar al río.");
                    document.getElementById("formReporte").reset();
                    document.getElementById("barrio").innerHTML = '<option value="">-- Primero selecciona una localidad --</option>';
                }
            } catch (err) {
                console.error("Error inesperado:", err);
                alert(`❌ Error inesperado: ${err.message}`);
            } finally {
                // El botón siempre se vuelve a habilitar (si el formulario sigue en pantalla)
                const btn = document.getElementById("btnEnviarReporte");
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = "Enviar reporte";
                }
            }
        });
    }
    else if (seccion === "alertas") {
        contenido.innerHTML = `
            <h2>🚨 Alertas</h2>
            <p>Aquí puedes ver el estado de tus reportes.</p>
            <div id="alertas-container">
                <p>Cargando tus reportes...</p>
            </div>
            <button onclick="mostrarSeccion('inicio')" style="margin-top:16px;">Volver al inicio</button>
        `;
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
                    allow="fullscreen"
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
    const contenedor = document.getElementById("contenedorJuego");
    if (!contenedor) return;

    try {
        if (contenedor.requestFullscreen) {
            contenedor.requestFullscreen();
        } else if (contenedor.webkitRequestFullscreen) { // Safari
            contenedor.webkitRequestFullscreen();
        } else if (contenedor.msRequestFullscreen) {
            contenedor.msRequestFullscreen();
        } else {
            alert("Tu navegador no permite pantalla completa. Usa el botón de 'Abrir en pestaña nueva'.");
        }
    } catch (e) {
        console.warn("No se pudo activar pantalla completa:", e);
        alert("No se pudo activar la pantalla completa. Usa 'Abrir en pestaña nueva'.");
    }
}

// ========================================
// FUNCIÓN: Cargar alertas del usuario (con etiquetas de estado)
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

        const nombresEstados = {
            "reportado": "🔴 Reportado",
            "en_revision": "🟡 En revisión",
            "en_proceso": "🔵 En proceso",
            "solucionado": "🟢 Solucionado"
        };

        let html = "";

        // Tarjeta roja de la alerta simulada (arriba de todo)
        if (alertaSimuladaActiva) {
            html += `
                <div style="background: #fee2e2; border-left: 5px solid #991b1b; padding: 16px; border-radius: 14px; margin-bottom: 16px; text-align: left; box-shadow: 0 4px 10px rgba(153, 27, 27, 0.1);">
                    <h3 style="color: #991b1b; margin-bottom: 8px;">🚨 ALERTA AUTOMÁTICA</h3>
                    <p style="color: #7f1d1d; font-size: 14px; margin-bottom: 8px;"><strong>Sensor de nivel:</strong> Nivel elevado detectado</p>
                    <p style="color: #7f1d1d; font-size: 14px; margin-bottom: 8px;"><strong>Punto:</strong> Punto 1 (Tunjuelito)</p>
                    <p style="color: #7f1d1d; font-size: 14px;"><strong>Estado:</strong> ⚠️ Posible riesgo de inundación</p>
                    <small style="color: #991b1b; display:block; margin-top:10px;">Hace unos segundos</small>
                </div>
            `;
        }

        if (!reportes || reportes.length === 0) {
            html += `<p>No has enviado ningún reporte aún.</p>`;
            container.innerHTML = html;
            return;
        }

        html += `<h3 style="text-align:left; margin-bottom:14px; color:#1a4d4e;">📋 Tus reportes (${reportes.length})</h3>`;

        for (let r of reportes) {
            const estado = r.estado || "reportado";
            const estadoTexto = nombresEstados[estado] || estado.toUpperCase();
            const claseEstado = `estado-${estado}`;
            const fecha = new Date(r.fecha_reporte).toLocaleString("es-CO", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            });

            html += `
                <div class="tarjeta-reporte">
                    <strong>${escaparHTML(r.tipo)}</strong>
                    <div class="fila-info">📍 <strong>Ubicación:</strong> ${escaparHTML(r.ubicacion) || "N/A"}</div>
                    ${r.direccion ? `<div class="fila-info">🏠 <strong>Dirección:</strong> ${escaparHTML(r.direccion)}</div>` : ""}
                    <div class="fila-info">⚠️ <strong>Gravedad:</strong> ${escaparHTML(r.gravedad || "media")}</div>
                    ${r.descripcion ? `<div class="fila-info">📝 ${escaparHTML(r.descripcion)}</div>` : ""}
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
    const contenido = document.getElementById("contenido");
    seccionActual = "perfil";
    if (usuarioActual) {
        contenido.innerHTML = `
            <div class="perfil">
                <div class="icono-perfil" style="font-size:60px;">👤</div>
                <h2>Mi perfil</h2>
                <p><strong>Nombre:</strong> ${escaparHTML(usuarioActual.user_metadata?.nombre) || "Sin nombre"}</p>
                <p><strong>Correo:</strong> ${escaparHTML(usuarioActual.email)}</p>
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
// ALERTAS DEL SENSOR EN TIEMPO REAL (Supabase Realtime)
// ========================================
function escucharAlertasSensor() {
    if (typeof window.supabase === "undefined") {
        console.error("Supabase no disponible para escuchar alertas del sensor.");
        return;
    }
    const supabase = window.supabase;

    supabase
        .channel("mediciones-realtime")
        .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "mediciones" },
            (payload) => {
                const valor = Number(payload.new.nivel_agua);
                console.log("📡 Nueva medición recibida:", valor);

                if (valor >= UMBRAL_ALERTA) {
                    const ahora = Date.now();
                    // Evitar alertas seguidas
                    if (ahora - ultimaAlertaSensor < PAUSA_ENTRE_ALERTAS_MS) return;
                    ultimaAlertaSensor = ahora;

                    mostrarNotificacion("🚨 EcoAlerta", "Nivel alto detectado en el río Tunjuelito.");
                    mostrarBannerAlerta("¡El nivel del agua ha subido! Posible riesgo de inundación.");
                }
            }
        )
        .subscribe((status) => {
            console.log("Estado del canal Realtime:", status);
        });
}

// ========================================
// SIMULADOR DE ALERTA MÓVIL (PARA EL VIDEO)
// ========================================
function activarAlertaSimulada() {
    // Pedir permiso de notificaciones si aún no se ha decidido
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }

    // 15 segundos después de abrir la app
    setTimeout(() => {
        alertaSimuladaActiva = true;
        console.log("🚨 ¡Alerta simulada activada!");

        mostrarNotificacion(
            "🚨 ALERTA ECOALERTA",
            "Posible riesgo de inundación. El nivel del agua en el Punto 1 ha subido."
        );
        mostrarBannerAlerta("El sensor ha detectado un nivel elevado de agua. Posible riesgo de inundación.");

        // Si el usuario está viendo "Alertas", se actualiza al instante
        if (seccionActual === "alertas") {
            cargarAlertasUsuario();
        }
    }, 15000);
}

// ========================================
// EJECUTAR AL CARGAR LA PÁGINA (un solo DOMContentLoaded)
// ========================================
document.addEventListener("DOMContentLoaded", function() {
    verificarSesion();

    // Pedir permiso para notificaciones del navegador
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }

    if (ESCUCHAR_SENSOR_REALTIME) {
        escucharAlertasSensor();
    }

    if (ALERTA_SIMULADA_ACTIVA) {
        activarAlertaSimulada();
    }
});