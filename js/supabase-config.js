// ============================================
// CONFIGURACIÓN DE SUPABASE (versión global)
// ============================================

const SUPABASE_URL = "https://uvlndyaamzkloibqtrcp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2bG5keWFhbXprbG9pYnF0cmNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MDgxNzMsImV4cCI6MjEwMzE4NDE3M30.JY2CQKpLDd8vi9x6KEtvOGdaH5bkMxhmKHGg7fojZ6A";
// Crear el cliente y asignarlo a la variable global window
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabase = supabaseClient;   // <--- ¡Esto es lo importante!

// Mensaje de confirmación
console.log("✅ Cliente de Supabase inicializado y disponible globalmente.");