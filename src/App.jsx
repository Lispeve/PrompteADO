import { useState, useRef, useEffect } from "react";

// ─── CONFIG (reemplaza con tus keys reales) ───────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL;
const GROQ_MODEL = "llama-3.3-70b-versatile";

// ─── SUPABASE HELPERS ─────────────────────────────────────────────────────────
async function supabaseFetch(path, options = {}) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
        ...options,
        headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
            ...(options.headers || {}),
        },
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
    }
    return res.json();
}

async function getUserByEmail(email) {
    const data = await supabaseFetch(
        `/usuarios?correo=eq.${encodeURIComponent(email)}&select=*`
    );
    return data[0] || null;
}

async function getAllUsers() {
    return supabaseFetch(`/usuarios?select=*&order=created_at.desc`);
}

async function updateUserStatus(id, estado) {
    return supabaseFetch(`/usuarios?id=eq.${id}`, {
        method: "PATCH",
        body: JSON.stringify({ estado }),
    });
}

async function addUser(nombre, correo, plan) {
    return supabaseFetch(`/usuarios`, {
        method: "POST",
        body: JSON.stringify({ nombre, correo, plan, estado: "activo" }),
    });
}

async function uploadDocument(file) {
    const text = await readFileText(file);
    return supabaseFetch(`/documents`, {
        method: "POST",
        body: JSON.stringify({
            content: text,
            metadata: { filename: file.name, uploaded_at: new Date().toISOString() },
        }),
    });
}

function readFileText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

// ─── GROQ ─────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Eres PrompteADO, un asistente especializado en ayudar a estudiantes universitarios mexicanos y latinoamericanos a crear prompts optimizados para sus tareas académicas.

Cuando un estudiante te describa su tarea, debes:
1. Identificar el tipo de tarea (ensayo, resumen, análisis, código, presentación, investigación, etc.)
2. Seleccionar la técnica de prompting más adecuada (Chain of Thought, Few-shot, Role prompting, etc.)
3. Generar un prompt optimizado, listo para copiar y pegar
4. Recomendar la IA más adecuada para esa tarea específica

Formato de respuesta SIEMPRE:
---TÉCNICA USADA---
[nombre de la técnica y por qué]

---PROMPT OPTIMIZADO---
[el prompt listo para copiar, en español, bien estructurado]

---IA RECOMENDADA---
[ChatGPT / Claude / Gemini / Perplexity] — [razón breve]

---CONSEJO EXTRA---
[un tip rápido para mejorar el resultado]

Responde siempre en español mexicano, de forma amigable y directa. El prompt debe ser específico, claro y listo para usar.`;

async function callGroq(messages) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
            model: GROQ_MODEL,
            messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
            temperature: 0.7,
            max_tokens: 1024,
        }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.choices[0].message.content;
}

// ─── TIPS DATA ────────────────────────────────────────────────────────────────
const TIPS = [
    { emoji: "🎯", color: "#cc0000", title: "Sé específico", text: "Entre más detalles des, mejor será el prompt. Incluye el tema, nivel académico y propósito." },
    { emoji: "🎭", color: "#1a1a6e", title: "Asigna un rol", text: 'Dile a la IA quién debe ser: "Actúa como un experto en biología molecular..."' },
    { emoji: "📝", color: "#2d7d2d", title: "Da contexto", text: "Menciona para qué es la tarea: examen, ensayo, presentación, exposición oral..." },
    { emoji: "🔢", color: "#7d2d7d", title: "Pide formato", text: 'Especifica: "en 3 párrafos", "con bullet points", "máximo 300 palabras".' },
    { emoji: "🧠", color: "#7d5a00", title: "Paso a paso", text: 'Pide que piense antes de responder: "Razona paso a paso antes de dar tu respuesta."' },
    { emoji: "📚", color: "#006b7d", title: "Cita fuentes", text: 'Agrega: "Incluye al menos 3 fuentes académicas con formato APA." para trabajos formales.' },
    { emoji: "🔄", color: "#cc5500", title: "Itera y mejora", text: "Si no te gusta la respuesta, pide ajustes específicos. La IA recuerda el contexto." },
    { emoji: "🌍", color: "#1a6e1a", title: "Idioma y tono", text: 'Especifica: "en español formal", "en tono académico", "sin tecnicismos".' },
    { emoji: "⚡", color: "#5a0099", title: "Usa ejemplos", text: 'Dale un ejemplo de lo que quieres: "Quiero algo similar a este párrafo: [ejemplo]"' },
];

// ─── SESSION ──────────────────────────────────────────────────────────────────
function getSession() {
    try { return JSON.parse(localStorage.getItem("prompteado_user")); } catch { return null; }
}
function setSession(user) {
    localStorage.setItem("prompteado_user", JSON.stringify(user));
}
function clearSession() {
    localStorage.removeItem("prompteado_user");
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPONENTES
// ═════════════════════════════════════════════════════════════════════════════

// ─── BUS SVG ──────────────────────────────────────────────────────────────────
function BusSVG({ onClick, animated = true }) {
    return (
        <svg
            viewBox="0 0 320 160"
            xmlns="http://www.w3.org/2000/svg"
            style={{
                cursor: onClick ? "pointer" : "default",
                filter: animated ? "drop-shadow(0 8px 24px rgba(26,26,110,0.4))" : "none",
                animation: animated ? "busFloat 3s ease-in-out infinite" : "none",
                width: "100%", maxWidth: 320,
            }}
            onClick={onClick}
        >
            {/* Cuerpo */}
            <rect x="10" y="40" width="300" height="100" rx="12" fill="#1a1a6e" />
            {/* Franja roja */}
            <rect x="10" y="90" width="300" height="20" fill="#cc0000" />
            {/* Techo */}
            <rect x="20" y="30" width="280" height="20" rx="8" fill="#0d0d4a" />
            {/* Ventanas */}
            {[40, 90, 140, 190, 240].map((x) => (
                <rect key={x} x={x} y="50" width="38" height="28" rx="4" fill="#a8d4f5" opacity="0.85" />
            ))}
            {/* Parabrisas delantero */}
            <rect x="268" y="48" width="32" height="30" rx="4" fill="#a8d4f5" opacity="0.9" />
            {/* Puerta */}
            <rect x="24" y="108" width="28" height="32" rx="3" fill="#0d0d4a" />
            <line x1="38" y1="108" x2="38" y2="140" stroke="#1a1a6e" strokeWidth="2" />
            {/* Ruedas */}
            <circle cx="70" cy="145" r="16" fill="#222" />
            <circle cx="70" cy="145" r="8" fill="#555" />
            <circle cx="250" cy="145" r="16" fill="#222" />
            <circle cx="250" cy="145" r="8" fill="#555" />
            {/* Letrero ADO */}
            <rect x="60" y="32" width="80" height="16" rx="3" fill="#cc0000" />
            <text x="100" y="44" textAnchor="middle" fill="white" fontSize="9" fontWeight="bold" fontFamily="monospace">PrompteADO</text>
            {/* Luces */}
            <rect x="290" y="108" width="16" height="10" rx="2" fill="#ffdd00" />
            <rect x="14" y="108" width="16" height="10" rx="2" fill="#ff4444" />
        </svg>
    );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleLogin = async () => {
        if (!email.trim()) return;
        setLoading(true);
        setError("");
        try {
            const user = await getUserByEmail(email.trim().toLowerCase());
            if (!user) {
                setError("❌ Este correo no está registrado. ¿Ya compraste tu acceso en Whop?");
            } else if (user.estado === "pendiente") {
                setError("⏳ Tu acceso está pendiente de activación. Te avisaremos pronto.");
            } else if (user.estado === "activo") {
                setSession(user);
                onLogin(user);
            } else {
                setError("⚠️ Cuenta suspendida. Escríbenos para más info.");
            }
        } catch (e) {
            setError("🔌 Error conectando con la base de datos. Verifica la configuración.");
        }
        setLoading(false);
    };

    return (
        <div style={styles.loginWrap}>
            <div style={styles.loginCard}>
                <div style={{ marginBottom: 8 }}>
                    <BusSVG animated={false} />
                </div>
                <h1 style={styles.loginTitle}>PrompteADO</h1>
                <p style={styles.loginTagline}>Inteligencia que sí llega adonde quieres.</p>
                <div style={styles.loginForm}>
                    <input
                        type="email"
                        placeholder="Tu correo de acceso"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                        style={styles.loginInput}
                    />
                    <button onClick={handleLogin} disabled={loading} style={styles.loginBtn}>
                        {loading ? "Verificando..." : "Subir al bus 🚌"}
                    </button>
                    {error && <p style={styles.loginError}>{error}</p>}
                    <p style={styles.loginHint}>
                        ¿No tienes acceso?{" "}
                        <a href="https://whop.com" target="_blank" rel="noreferrer" style={{ color: "#cc0000" }}>
                            Cómpralo aquí
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function HomeScreen({ user, onNavigate }) {
    const hora = new Date().getHours();
    const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";

    return (
        <div style={styles.screen}>
            <div style={styles.homeContent}>
                <p style={styles.homeSaludo}>{saludo},</p>
                <h2 style={styles.homeNombre}>{user.nombre?.split(" ")[0] || "estudiante"} 👋</h2>
                <p style={styles.homeSub}>Tu asistente de prompts está listo.</p>
                <div style={{ margin: "32px 0 16px" }}>
                    <BusSVG onClick={() => onNavigate("chat")} />
                </div>
                <p style={styles.homeHint}>
                    🚌 <strong>Dale clic al bus</strong> para promptear
                </p>
                <div style={styles.homeBadge}>
                    <span style={{ color: "#cc0000", fontWeight: 700 }}>
                        {user.plan === "fundador" ? "⭐ Fundador" : user.plan === "early_access" ? "🚀 Early Access" : "✨ Miembro"}
                    </span>
                </div>
            </div>
        </div>
    );
}

// ─── CHAT ─────────────────────────────────────────────────────────────────────
function ChatScreen({ user }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [file, setFile] = useState(null);
    const [copied, setCopied] = useState(null);
    const bottomRef = useRef(null);
    const fileRef = useRef(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);

    const send = async () => {
        const text = input.trim();
        if (!text && !file) return;
        let userContent = text;
        if (file) userContent = `[Archivo adjunto: ${file.name}]\n\n${text}`;

        const newMessages = [...messages, { role: "user", content: userContent }];
        setMessages(newMessages);
        setInput("");
        setFile(null);
        setLoading(true);

        try {
            const reply = await callGroq(newMessages);
            setMessages([...newMessages, { role: "assistant", content: reply }]);
        } catch (e) {
            setMessages([...newMessages, { role: "assistant", content: "⚠️ Error al conectar con Groq. Verifica tu API key." }]);
        }
        setLoading(false);
    };

    const copyMsg = (text, idx) => {
        navigator.clipboard.writeText(text);
        setCopied(idx);
        setTimeout(() => setCopied(null), 1500);
    };

    const extractPrompt = (text) => {
        const match = text.match(/---PROMPT OPTIMIZADO---\n([\s\S]*?)(?:---|$)/);
        return match ? match[1].trim() : text;
    };

    const handleFile = async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        setFile(f);
        // Si es para subir a Supabase:
        // await uploadDocument(f);
    };

    return (
        <div style={styles.chatWrap}>
            {/* Interior del bus como fondo */}
            <div style={styles.chatBusInterior}>
                <div style={styles.chatHeader}>
                    <span style={{ fontSize: 20 }}>🚌</span>
                    <span style={styles.chatTitle}>PrompteADO</span>
                    <span style={{ fontSize: 12, color: "#a8d4f5", opacity: 0.8 }}>Groq · llama-3.3</span>
                </div>

                {/* Ventana/parabrisas con mensajes */}
                <div style={styles.chatWindow}>
                    {messages.length === 0 && (
                        <div style={styles.chatEmpty}>
                            <p style={{ fontSize: 32, marginBottom: 8 }}>✏️</p>
                            <p style={{ color: "#1a1a6e", fontWeight: 600, marginBottom: 4 }}>Describe tu tarea</p>
                            <p style={{ color: "#555", fontSize: 13 }}>
                                Ej: "Necesito un ensayo de 500 palabras sobre la Revolución Mexicana para Historia"
                            </p>
                        </div>
                    )}
                    {messages.map((m, i) => (
                        <div key={i} style={{ marginBottom: 16 }}>
                            <div style={m.role === "user" ? styles.msgUser : styles.msgBot}>
                                <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{m.content}</p>
                            </div>
                            {m.role === "assistant" && (
                                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                                    <button onClick={() => copyMsg(extractPrompt(m.content), i)} style={styles.copyBtn}>
                                        {copied === i ? "✅ Copiado" : "📋 Copiar prompt"}
                                    </button>
                                    <button onClick={() => copyMsg(m.content, i + 1000)} style={{ ...styles.copyBtn, background: "#eee", color: "#333" }}>
                                        {copied === i + 1000 ? "✅" : "📄 Todo"}
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                    {loading && (
                        <div style={styles.msgBot}>
                            <span style={styles.typing}>●●●</span>
                        </div>
                    )}
                    <div ref={bottomRef} />
                </div>

                {/* Input */}
                <div style={styles.chatInputArea}>
                    {file && (
                        <div style={styles.fileChip}>
                            📎 {file.name}
                            <button onClick={() => setFile(null)} style={styles.removeFile}>✕</button>
                        </div>
                    )}
                    <div style={styles.chatInputRow}>
                        <button onClick={() => fileRef.current.click()} style={styles.attachBtn} title="Adjuntar archivo">
                            📎
                        </button>
                        <input type="file" ref={fileRef} style={{ display: "none" }} onChange={handleFile} accept=".txt,.pdf,.doc,.docx,.md" />
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                            placeholder="Describe tu tarea aquí..."
                            style={styles.chatInput}
                            rows={2}
                        />
                        <button onClick={send} disabled={loading} style={styles.sendBtn}>
                            {loading ? "⏳" : "🚀"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── TIPS ─────────────────────────────────────────────────────────────────────
function TipsScreen() {
    return (
        <div style={styles.screen}>
            <h2 style={styles.sectionTitle}>💡 Tips PrompteADO</h2>
            <p style={{ color: "#666", marginBottom: 20, fontSize: 14 }}>Domina el arte de hablarle a la IA</p>
            <div style={styles.tipsGrid}>
                {TIPS.map((t, i) => (
                    <div key={i} style={{ ...styles.tipCard, borderTop: `4px solid ${t.color}` }}>
                        <span style={{ fontSize: 28 }}>{t.emoji}</span>
                        <h3 style={{ ...styles.tipTitle, color: t.color }}>{t.title}</h3>
                        <p style={styles.tipText}>{t.text}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── PERFIL ───────────────────────────────────────────────────────────────────
function ProfileScreen({ user, onLogout, darkMode, setDarkMode }) {
    const initial = (user.nombre || "U")[0].toUpperCase();
    const planLabel = user.plan === "fundador" ? "⭐ Fundador" : user.plan === "early_access" ? "🚀 Early Access" : "✨ Miembro";

    return (
        <div style={styles.screen}>
            <div style={styles.profileCard}>
                <div style={styles.avatar}>{initial}</div>
                <h2 style={{ margin: "12px 0 4px", fontSize: 22, color: "#1a1a6e" }}>{user.nombre}</h2>
                <p style={{ color: "#888", fontSize: 14, marginBottom: 16 }}>{user.correo}</p>
                <div style={styles.planBadge}>{planLabel}</div>
                <div style={styles.profileDivider} />
                <div style={styles.toggleRow}>
                    <span style={{ fontSize: 14, color: "#333" }}>🌙 Modo oscuro</span>
                    <button onClick={() => setDarkMode(!darkMode)} style={{ ...styles.toggle, background: darkMode ? "#1a1a6e" : "#ccc" }}>
                        <span style={{ ...styles.toggleKnob, left: darkMode ? 22 : 2 }} />
                    </button>
                </div>
                <div style={styles.profileDivider} />
                <button onClick={onLogout} style={styles.logoutBtn}>Cerrar sesión 🚪</button>
            </div>
        </div>
    );
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────
function AdminScreen() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newUser, setNewUser] = useState({ nombre: "", correo: "", plan: "early_access" });
    const [msg, setMsg] = useState("");
    const [fileMsg, setFileMsg] = useState("");
    const fileRef = useRef(null);

    useEffect(() => { fetchUsers(); }, []);

    const fetchUsers = async () => {
        setLoading(true);
        try { setUsers(await getAllUsers()); } catch { setMsg("Error cargando usuarios"); }
        setLoading(false);
    };

    const activate = async (id) => {
        await updateUserStatus(id, "activo");
        fetchUsers();
    };

    const addNewUser = async () => {
        if (!newUser.nombre || !newUser.correo) return;
        try {
            await addUser(newUser.nombre, newUser.correo, newUser.plan);
            setMsg("✅ Usuario agregado");
            setNewUser({ nombre: "", correo: "", plan: "early_access" });
            fetchUsers();
        } catch { setMsg("❌ Error al agregar usuario"); }
    };

    const handleDocUpload = async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        setFileMsg("Subiendo...");
        try {
            await uploadDocument(f);
            setFileMsg(`✅ ${f.name} subido a Supabase`);
        } catch { setFileMsg("❌ Error al subir documento"); }
    };

    const fundadores = users.filter(u => u.plan === "fundador");
    const earlyAccess = users.filter(u => u.plan === "early_access");
    const pendientes = users.filter(u => u.estado === "pendiente");

    return (
        <div style={{ ...styles.screen, paddingBottom: 80 }}>
            <h2 style={styles.sectionTitle}>🔧 Panel Admin</h2>

            {/* Contadores */}
            <div style={styles.adminCounters}>
                <div style={styles.counter}>
                    <span style={styles.counterNum}>{fundadores.length}<span style={styles.counterOf}>/10</span></span>
                    <span style={styles.counterLabel}>⭐ Fundadores</span>
                </div>
                <div style={styles.counter}>
                    <span style={styles.counterNum}>{earlyAccess.length}<span style={styles.counterOf}>/40</span></span>
                    <span style={styles.counterLabel}>🚀 Early Access</span>
                </div>
                <div style={styles.counter}>
                    <span style={{ ...styles.counterNum, color: "#cc0000" }}>{pendientes.length}</span>
                    <span style={styles.counterLabel}>⏳ Pendientes</span>
                </div>
            </div>

            {/* Agregar usuario */}
            <div style={styles.adminBox}>
                <h3 style={styles.adminBoxTitle}>➕ Agregar usuario</h3>
                <input placeholder="Nombre completo" value={newUser.nombre} onChange={e => setNewUser({ ...newUser, nombre: e.target.value })} style={styles.adminInput} />
                <input placeholder="Correo" type="email" value={newUser.correo} onChange={e => setNewUser({ ...newUser, correo: e.target.value })} style={styles.adminInput} />
                <select value={newUser.plan} onChange={e => setNewUser({ ...newUser, plan: e.target.value })} style={styles.adminInput}>
                    <option value="fundador">⭐ Fundador ($99)</option>
                    <option value="early_access">🚀 Early Access ($150)</option>
                </select>
                <button onClick={addNewUser} style={styles.adminBtn}>Agregar y activar</button>
                {msg && <p style={{ fontSize: 13, marginTop: 8, color: msg.includes("✅") ? "green" : "red" }}>{msg}</p>}
            </div>

            {/* Subir documento RAG */}
            <div style={styles.adminBox}>
                <h3 style={styles.adminBoxTitle}>📚 Subir documento a Supabase (RAG)</h3>
                <p style={{ fontSize: 13, color: "#666", marginBottom: 10 }}>Sube tus guías de prompting, matrices de decisión, etc.</p>
                <button onClick={() => fileRef.current.click()} style={styles.adminBtn}>📎 Seleccionar archivo</button>
                <input type="file" ref={fileRef} style={{ display: "none" }} onChange={handleDocUpload} accept=".txt,.md" />
                {fileMsg && <p style={{ fontSize: 13, marginTop: 8, color: fileMsg.includes("✅") ? "green" : "#cc0000" }}>{fileMsg}</p>}
            </div>

            {/* Tabla usuarios */}
            <div style={styles.adminBox}>
                <h3 style={styles.adminBoxTitle}>👥 Todos los usuarios</h3>
                {loading ? <p style={{ color: "#888" }}>Cargando...</p> : (
                    <div style={{ overflowX: "auto" }}>
                        <table style={styles.table}>
                            <thead>
                                <tr>
                                    {["Nombre", "Correo", "Plan", "Estado", "Acción"].map(h => (
                                        <th key={h} style={styles.th}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(u => (
                                    <tr key={u.id}>
                                        <td style={styles.td}>{u.nombre}</td>
                                        <td style={styles.td}>{u.correo}</td>
                                        <td style={styles.td}>{u.plan}</td>
                                        <td style={styles.td}>
                                            <span style={{ color: u.estado === "activo" ? "green" : "#cc0000", fontWeight: 600 }}>
                                                {u.estado}
                                            </span>
                                        </td>
                                        <td style={styles.td}>
                                            {u.estado === "pendiente" && (
                                                <button onClick={() => activate(u.id)} style={styles.activateBtn}>Activar</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── NAVBAR ───────────────────────────────────────────────────────────────────
function Navbar({ active, onNavigate, isAdmin }) {
    const items = [
        { id: "tips", label: "Tips", icon: "💡" },
        { id: "chat", label: "Promptea", icon: "🚌" },
        { id: "profile", label: "Perfil", icon: "👤" },
    ];
    if (isAdmin) items.push({ id: "admin", label: "Admin", icon: "🔧" });

    return (
        <nav style={styles.navbar}>
            {items.map(item => (
                <button key={item.id} onClick={() => onNavigate(item.id)} style={{ ...styles.navItem, color: active === item.id ? "#cc0000" : "#888" }}>
                    <span style={{ fontSize: 22 }}>{item.icon}</span>
                    <span style={{ fontSize: 11, fontWeight: active === item.id ? 700 : 400 }}>{item.label}</span>
                </button>
            ))}
        </nav>
    );
}

// ═════════════════════════════════════════════════════════════════════════════
// APP PRINCIPAL
// ═════════════════════════════════════════════════════════════════════════════
export default function PrompteADO() {
    const [user, setUser] = useState(getSession);
    const [screen, setScreen] = useState("home");
    const [darkMode, setDarkMode] = useState(false);

    const handleLogin = (u) => { setUser(u); setScreen("home"); };
    const handleLogout = () => { clearSession(); setUser(null); setScreen("home"); };
    const isAdmin = user?.correo === ADMIN_EMAIL;

    if (!user) return (
        <>
            <GlobalStyles darkMode={false} />
            <LoginScreen onLogin={handleLogin} />
        </>
    );

    return (
        <>
            <GlobalStyles darkMode={darkMode} />
            <div style={{ ...styles.appWrap, background: darkMode ? "#0d0d1a" : "#f4f6fb", color: darkMode ? "#eee" : "#111" }}>
                <div style={styles.appInner}>
                    {screen === "home" && <HomeScreen user={user} onNavigate={setScreen} />}
                    {screen === "chat" && <ChatScreen user={user} />}
                    {screen === "tips" && <TipsScreen />}
                    {screen === "profile" && <ProfileScreen user={user} onLogout={handleLogout} darkMode={darkMode} setDarkMode={setDarkMode} />}
                    {screen === "admin" && isAdmin && <AdminScreen />}
                    <Navbar active={screen} onNavigate={setScreen} isAdmin={isAdmin} />
                </div>
            </div>
        </>
    );
}

// ─── GLOBAL STYLES INJECTOR ───────────────────────────────────────────────────
function GlobalStyles({ darkMode }) {
    useEffect(() => {
        const style = document.createElement("style");
        style.id = "prompteado-styles";
        style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&display=swap');
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Space Grotesk', sans-serif; }
      @keyframes busFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
      @keyframes typing { 0%,80%,100%{opacity:0.3} 40%{opacity:1} }
      .typing span:nth-child(1){animation-delay:0s}
      .typing span:nth-child(2){animation-delay:.2s}
      .typing span:nth-child(3){animation-delay:.4s}
      textarea:focus, input:focus { outline: 2px solid #1a1a6e !important; }
      ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#f0f0f0} ::-webkit-scrollbar-thumb{background:#1a1a6e;border-radius:4px}
    `;
        document.head.appendChild(style);
        return () => document.getElementById("prompteado-styles")?.remove();
    }, []);
    return null;
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = {
    // Login
    loginWrap: { minHeight: "100vh", background: "linear-gradient(135deg, #1a1a6e 0%, #0d0d4a 60%, #cc0000 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
    loginCard: { background: "white", borderRadius: 20, padding: "32px 28px", maxWidth: 360, width: "100%", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" },
    loginTitle: { fontSize: 32, fontWeight: 700, color: "#1a1a6e", letterSpacing: -1, margin: "8px 0 4px" },
    loginTagline: { color: "#888", fontSize: 13, marginBottom: 24, fontStyle: "italic" },
    loginForm: { display: "flex", flexDirection: "column", gap: 12 },
    loginInput: { padding: "12px 16px", borderRadius: 10, border: "2px solid #e0e0e0", fontSize: 15, fontFamily: "inherit" },
    loginBtn: { padding: "13px", background: "#1a1a6e", color: "white", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: "pointer", transition: "background .2s" },
    loginError: { color: "#cc0000", fontSize: 13, padding: "8px 12px", background: "#fff0f0", borderRadius: 8, textAlign: "left" },
    loginHint: { fontSize: 13, color: "#888" },
    // App
    appWrap: { minHeight: "100vh", transition: "background .3s" },
    appInner: { maxWidth: 480, margin: "0 auto", minHeight: "100vh", position: "relative", display: "flex", flexDirection: "column" },
    screen: { flex: 1, padding: "24px 20px 100px", overflowY: "auto" },
    // Home
    homeContent: { display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 40, textAlign: "center" },
    homeSaludo: { fontSize: 16, color: "#888", marginBottom: 4 },
    homeNombre: { fontSize: 28, fontWeight: 700, color: "#1a1a6e", marginBottom: 4 },
    homeSub: { fontSize: 14, color: "#888" },
    homeHint: { color: "#555", fontSize: 14 },
    homeBadge: { marginTop: 16, padding: "6px 16px", background: "#fff0f0", borderRadius: 20, fontSize: 13 },
    // Chat
    chatWrap: { flex: 1, display: "flex", flexDirection: "column", paddingBottom: 72 },
    chatBusInterior: { flex: 1, display: "flex", flexDirection: "column", background: "linear-gradient(180deg, #1a1a6e 0%, #0d0d4a 100%)", minHeight: "calc(100vh - 72px)" },
    chatHeader: { display: "flex", alignItems: "center", gap: 8, padding: "16px 20px 8px", borderBottom: "1px solid rgba(255,255,255,0.1)" },
    chatTitle: { color: "white", fontWeight: 700, fontSize: 16, flex: 1 },
    chatWindow: { flex: 1, overflowY: "auto", padding: "16px 16px 8px", background: "rgba(255,255,255,0.95)", margin: "8px 12px", borderRadius: 12, minHeight: 300, maxHeight: "calc(100vh - 280px)" },
    chatEmpty: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, textAlign: "center" },
    chatInputArea: { padding: "8px 12px 16px" },
    chatInputRow: { display: "flex", gap: 8, alignItems: "flex-end" },
    chatInput: { flex: 1, padding: "10px 14px", borderRadius: 10, border: "none", fontSize: 14, fontFamily: "inherit", resize: "none", background: "white" },
    sendBtn: { padding: "10px 16px", background: "#cc0000", color: "white", border: "none", borderRadius: 10, fontSize: 20, cursor: "pointer" },
    attachBtn: { padding: "10px", background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 10, fontSize: 18, cursor: "pointer", color: "white" },
    msgUser: { background: "#1a1a6e", color: "white", padding: "10px 14px", borderRadius: "12px 12px 4px 12px", fontSize: 14, marginLeft: 40 },
    msgBot: { background: "#f0f4ff", color: "#111", padding: "10px 14px", borderRadius: "12px 12px 12px 4px", fontSize: 14, marginRight: 20 },
    typing: { display: "inline-flex", gap: 3, fontSize: 20, animation: "typing 1.2s infinite" },
    copyBtn: { fontSize: 12, padding: "4px 10px", background: "#1a1a6e", color: "white", border: "none", borderRadius: 6, cursor: "pointer" },
    fileChip: { display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.2)", color: "white", padding: "4px 10px", borderRadius: 8, fontSize: 12, marginBottom: 8 },
    removeFile: { background: "none", border: "none", color: "white", cursor: "pointer", fontSize: 14, padding: 0 },
    // Tips
    sectionTitle: { fontSize: 22, fontWeight: 700, color: "#1a1a6e", marginBottom: 8 },
    tipsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
    tipCard: { background: "white", borderRadius: 12, padding: "16px 14px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
    tipTitle: { fontSize: 13, fontWeight: 700, margin: "6px 0 4px" },
    tipText: { fontSize: 12, color: "#555", lineHeight: 1.5 },
    // Profile
    profileCard: { background: "white", borderRadius: 20, padding: 28, textAlign: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" },
    avatar: { width: 72, height: 72, background: "#1a1a6e", color: "white", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 700, margin: "0 auto" },
    planBadge: { display: "inline-block", padding: "6px 16px", background: "#fff0f0", color: "#cc0000", borderRadius: 20, fontWeight: 700, fontSize: 13 },
    profileDivider: { height: 1, background: "#f0f0f0", margin: "20px 0" },
    toggleRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
    toggle: { position: "relative", width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", transition: "background .3s" },
    toggleKnob: { position: "absolute", top: 2, width: 20, height: 20, background: "white", borderRadius: "50%", transition: "left .3s" },
    logoutBtn: { width: "100%", padding: "12px", background: "#fff0f0", color: "#cc0000", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", fontSize: 15 },
    // Admin
    adminCounters: { display: "flex", gap: 12, marginBottom: 20 },
    counter: { flex: 1, background: "white", borderRadius: 12, padding: "16px 12px", textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
    counterNum: { display: "block", fontSize: 28, fontWeight: 700, color: "#1a1a6e" },
    counterOf: { fontSize: 14, color: "#aaa" },
    counterLabel: { fontSize: 11, color: "#888" },
    adminBox: { background: "white", borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
    adminBoxTitle: { fontSize: 15, fontWeight: 700, color: "#1a1a6e", marginBottom: 12 },
    adminInput: { display: "block", width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #e0e0e0", fontSize: 14, fontFamily: "inherit", marginBottom: 8 },
    adminBtn: { padding: "10px 20px", background: "#1a1a6e", color: "white", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 14 },
    activateBtn: { padding: "4px 12px", background: "#1a1a6e", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12 },
    table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
    th: { background: "#f4f6fb", padding: "8px 10px", textAlign: "left", fontWeight: 600, color: "#1a1a6e" },
    td: { padding: "8px 10px", borderBottom: "1px solid #f0f0f0" },
    // Navbar
    navbar: { position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "white", borderTop: "1px solid #eee", display: "flex", justifyContent: "space-around", padding: "8px 0 12px", zIndex: 100, boxShadow: "0 -4px 20px rgba(0,0,0,0.08)" },
    navItem: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "4px 12px" },
};