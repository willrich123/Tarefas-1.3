// ═══════════════════════════════════════════════════════════════════════
// SERVIDOR DE LEMBRETES — Tarefas PWA
// Roda localmente e envia emails via EmailJS REST API mesmo com o
// browser completamente fechado.
//
// HOW TO USE:
//   1. npm install
//   2. node server.js   (deixar rodando em background)
//
// O servidor escuta na porta 3333. O frontend (index.html) registra
// lembretes via POST /api/remind e cancela via DELETE /api/remind/:id.
// O cron verifica a cada minuto quais lembretes devem ser enviados.
// ═══════════════════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3333;

// ── Configurações EmailJS ────────────────────────────────────────────────
const EMAILJS = {
    serviceId: 'service_46es4j2',
    templateId: 'template_cluuomn',
    publicKey: 'eQc4bsSrH6dLj36Jl',
    toEmail: 'Willricheduardo17@gmail.com, analuizaschug7@gmail.com',
    apiUrl: 'https://api.emailjs.com/api/v1.0/email/send',
};

// ── Persistência simples (JSON) ──────────────────────────────────────────
const DB_PATH = path.join(__dirname, 'reminders.json');

function loadDB() {
    try {
        if (fs.existsSync(DB_PATH)) return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch (e) { console.error('Erro ao ler DB:', e.message); }
    return [];
}

function saveDB(reminders) {
    try { fs.writeFileSync(DB_PATH, JSON.stringify(reminders, null, 2)); }
    catch (e) { console.error('Erro ao salvar DB:', e.message); }
}

// ── Envio de email via REST API ──────────────────────────────────────────
async function sendEmail(reminder) {
    try {
        const res = await axios.post(EMAILJS.apiUrl, {
            service_id: EMAILJS.serviceId,
            template_id: EMAILJS.templateId,
            user_id: EMAILJS.publicKey,
            template_params: {
                titulo: reminder.title || 'Tarefa',
                data: reminder.date || '—',
                hora: reminder.time || '—',
                categoria: reminder.category || '—',
                prioridade: reminder.priority || '—',
                notas: reminder.notes || '—',
                to_email: EMAILJS.toEmail,
                nome: 'Eduardo',
            },
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000,
        });

        console.log(`✅ [${new Date().toLocaleTimeString('pt-BR')}] Email enviado: "${reminder.title}" → status ${res.status}`);
        return true;
    } catch (err) {
        const msg = err.response?.data || err.message;
        console.error(`❌ Erro ao enviar email para "${reminder.title}":`, msg);
        return false;
    }
}

// ── Cron: verifica lembretes a cada minuto ───────────────────────────────
cron.schedule('* * * * *', async () => {
    const now = new Date();
    const reminders = loadDB();
    if (reminders.length === 0) return;

    let changed = false;
    for (const r of reminders) {
        if (r.sent || r.cancelled) continue;

        const dt = new Date(`${r.date}T${r.time || '09:00'}:00`);
        if (isNaN(dt.getTime())) continue;

        const diffMs = dt - now;
        // Dispara quando faltam até 60s (janela de 1 minuto do cron)
        if (diffMs <= 60000 && diffMs > -300000) {
            console.log(`⏰ Disparando lembrete: "${r.title}" (${r.date} ${r.time})`);
            const ok = await sendEmail(r);
            if (ok) { r.sent = true; r.sentAt = new Date().toISOString(); changed = true; }
        }
    }

    if (changed) saveDB(reminders);
});

// ── Middleware ───────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());

// Serve os arquivos estáticos do app (opcional)
app.use(express.static(__dirname));

// ── API ──────────────────────────────────────────────────────────────────

// POST /api/remind — registra ou atualiza um lembrete
app.post('/api/remind', (req, res) => {
    const { id, title, date, time, category, priority, notes } = req.body;
    if (!id || !title || !date) return res.status(400).json({ error: 'id, title e date são obrigatórios' });

    const hour = time || '09:00';
    const dt = new Date(`${date}T${hour}:00`);
    if (isNaN(dt.getTime())) return res.status(400).json({ error: 'Data/hora inválida' });
    if (dt < new Date()) return res.status(400).json({ error: 'Horário já passou', skipped: true });

    const reminders = loadDB();
    const idx = reminders.findIndex(r => r.id === id);
    const entry = { id, title, date, time: hour, category, priority, notes, sent: false, cancelled: false, createdAt: new Date().toISOString() };

    if (idx >= 0) reminders[idx] = entry;
    else reminders.push(entry);

    saveDB(reminders);
    console.log(`📬 Lembrete agendado: "${title}" para ${date} ${hour}`);
    res.json({ ok: true, scheduled: `${date} ${hour}` });
});

// DELETE /api/remind/:id — cancela um lembrete
app.delete('/api/remind/:id', (req, res) => {
    const reminders = loadDB();
    const idx = reminders.findIndex(r => r.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Não encontrado' });
    reminders[idx].cancelled = true;
    saveDB(reminders);
    console.log(`🔕 Lembrete cancelado: "${reminders[idx].title}"`);
    res.json({ ok: true });
});

// DELETE /api/remind — cancela todos
app.delete('/api/remind', (req, res) => {
    const reminders = loadDB().map(r => ({ ...r, cancelled: true }));
    saveDB(reminders);
    res.json({ ok: true, cancelled: reminders.length });
});

// GET /api/remind — lista lembretes (debug)
app.get('/api/remind', (req, res) => {
    res.json(loadDB());
});

// GET /api/status — health check
app.get('/api/status', (req, res) => {
    const all = loadDB();
    res.json({
        ok: true,
        time: new Date().toISOString(),
        pending: all.filter(r => !r.sent && !r.cancelled).length,
        sent: all.filter(r => r.sent).length,
        cancelled: all.filter(r => r.cancelled).length,
    });
});

// ── Start ────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n🚀 Servidor de lembretes rodando em http://localhost:${PORT}`);
    console.log(`   GET  /api/status   — verificar estado`);
    console.log(`   GET  /api/remind   — listar lembretes`);
    console.log(`   POST /api/remind   — registrar lembrete`);
    console.log(`   DEL  /api/remind/:id — cancelar lembrete\n`);
    console.log(`⏰ Cron ativo — verificando lembretes a cada minuto...\n`);
});
