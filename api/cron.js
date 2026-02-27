import { kv } from '@vercel/kv';
import axios from 'axios';

const EMAILJS = {
    serviceId: 'service_46es4j2',
    templateId: 'template_cluuomn',
    publicKey: 'eQc4bsSrH6dLj36Jl',
    toEmail: 'Willricheduardo17@gmail.com, analuizaschug7@gmail.com',
    apiUrl: 'https://api.emailjs.com/api/v1.0/email/send',
};

async function sendEmail(reminder) {
    try {
        await axios.post(EMAILJS.apiUrl, {
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
        });
        return true;
    } catch (err) {
        console.error(`Erro no EmailJS para ${reminder.id}:`, err.response?.data || err.message);
        return false;
    }
}

export default async function handler(req, res) {
    // Segurança: Verifica se a requisição veio do agendador da Vercel ou tem a chave secreta
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && req.headers['x-vercel-cron'] !== 'true') {
        return res.status(401).json({ error: 'Não autorizado' });
    }

    const now = new Date();
    const reminders = await kv.get('reminders') || [];
    let changed = false;

    for (const r of reminders) {
        if (r.sent || r.cancelled) continue;

        const dt = new Date(`${r.date}T${r.time || '09:00'}:00`);
        const diffMs = dt - now;

        // Janela de disparo: até 1 minuto no futuro ou 5 minutos no passado (atraso do cron)
        if (diffMs <= 60000 && diffMs > -300000) {
            console.log(`Disparando: ${r.title}`);
            const ok = await sendEmail(r);
            if (ok) {
                r.sent = true;
                r.sentAt = new Date().toISOString();
                changed = true;
            }
        }
    }

    if (changed) await kv.set('reminders', reminders);

    return res.status(200).json({ ok: true, processed: changed });
}
