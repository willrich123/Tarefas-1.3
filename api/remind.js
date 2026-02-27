import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    if (req.method === 'GET') {
        const reminders = await kv.get('reminders') || [];
        return res.status(200).json(reminders);
    }

    if (req.method === 'POST') {
        const { id, title, date, time, category, priority, notes } = req.body;
        if (!id || !title || !date) {
            return res.status(400).json({ error: 'Campos obrigatórios faltando' });
        }

        const reminders = await kv.get('reminders') || [];
        const newReminder = {
            id, title, date, time: time || '09:00',
            category, priority, notes,
            sent: false, cancelled: false, createdAt: new Date().toISOString()
        };

        const existingIndex = reminders.findIndex(r => r.id === id);
        if (existingIndex >= 0) {
            reminders[existingIndex] = newReminder;
        } else {
            reminders.push(newReminder);
        }

        await kv.set('reminders', reminders);
        return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
        const { id } = req.query;
        const reminders = await kv.get('reminders') || [];

        if (id) {
            const idx = reminders.findIndex(r => r.id === id);
            if (idx >= 0) reminders[idx].cancelled = true;
        } else {
            reminders.forEach(r => r.cancelled = true);
        }

        await kv.set('reminders', reminders);
        return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Método não permitido' });
}
