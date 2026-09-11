// ========================================
// NAVEGACIÓN COMPLETA ECOALERTA
// ========================================

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
// VARIABLE GLOBAL DE USUARIO
// ========================================
let usuarioActual = null;

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
        const contenido = document.getElementById("contenido");
        if (contenido && contenido.innerHTML.includes("Mi perfil")) {
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

                <button type="submit">Enviar reporte</button>
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

            const reporte = {
                usuario_id: usuarioActual.id,
                tipo: tipo,
                descripcion: descripcion || null,
                ubicacion: `${localidad} - ${barrio}`,
                direccion: direccion || null,
                latitud: null,
                longitud: null,
                gravedad: gravedad,
                estado: "reportado"
            };

            try {
                const { data, error } = await supabase
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
      contenido.innerHTML = `
          <h2>🎮 Rescate Río Tunjuelito</h2>
          <p>¡Ayuda a nuestro explorador a limpiar el río!</p>
          <div style="width: 100%; height: 80vh; border-radius: 16px; overflow: hidden; margin: 16px 0; box-shadow: 0 4px 14px rgba(0,0,0,0.08);">
              <iframe
                  src="https://angierodriguezp04-glitch.github.io/Rescate_Rio-Tunjuelito/"
                  style="width: 100%; height: 100%; border: none;"
                  allowfullscreen
              ></iframe>
          </div>
          <button onclick="mostrarSeccion('inicio')">Volver al inicio</button>
      `;
    }
    else if (seccion === "perfil") {
        mostrarPerfil();
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

        if (!reportes || reportes.length === 0) {
            container.innerHTML = `<p>No has enviado ningún reporte aún.</p>`;
            return;
        }

        // Nombres bonitos para los estados
        const nombresEstados = {
            "reportado": "🔴 Reportado",
            "en_revision": "🟡 En revisión",
            "en_proceso": "🔵 En proceso",
            "solucionado": "🟢 Solucionado"
        };

        let html = `<h3 style="text-align:left; margin-bottom:14px; color:#1a4d4e;">📋 Tus reportes (${reportes.length})</h3>`;

        for (let r of reportes) {
            const estadoTexto = nombresEstados[r.estado] || r.estado.toUpperCase();
            const claseEstado = `estado-${r.estado}`;
            const fecha = new Date(r.fecha_reporte).toLocaleString("es-CO", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            });

            html += `
                <div class="tarjeta-reporte">
                    <strong>${r.tipo}</strong>
                    <div class="fila-info">📍 <strong>Ubicación:</strong> ${r.ubicacion || "N/A"}</div>
                    ${r.direccion ? `<div class="fila-info">🏠 <strong>Dirección:</strong> ${r.direccion}</div>` : ""}
                    <div class="fila-info">⚠️ <strong>Gravedad:</strong> ${r.gravedad || "media"}</div>
                    ${r.descripcion ? `<div class="fila-info">📝 ${r.descripcion}</div>` : ""}
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
    if (usuarioActual) {
        contenido.innerHTML = `
            <div class="perfil">
                <div class="icono-perfil" style="font-size:60px;">👤</div>
                <h2>Mi perfil</h2>
                <p><strong>Nombre:</strong> ${usuarioActual.user_metadata?.nombre || "Sin nombre"}</p>
                <p><strong>Correo:</strong> ${usuarioActual.email}</p>
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
// EJECUTAR AL CARGAR LA PÁGINA
// ========================================
document.addEventListener("DOMContentLoaded", function() {
    verificarSesion();
});