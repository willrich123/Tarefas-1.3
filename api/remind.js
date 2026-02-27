import Redis from 'ioredis';

export default async function handler(req, res) {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
        return res.status(500).json({ error: 'Configuração Incompleta', mensagem: 'REDIS_URL não encontrada.' });
    }

    let redis;
    try {
        redis = new Redis(redisUrl);

        if (req.method === 'GET') {
            const data = await redis.get('reminders');
            const reminders = data ? JSON.parse(data) : [];
            return res.status(200).json(reminders);
        }

        if (req.method === 'POST') {
            const { id, title, date, time, category, priority, notes } = req.body;

            const data = await redis.get('reminders');
            const reminders = data ? JSON.parse(data) : [];

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

            await redis.set('reminders', JSON.stringify(reminders));
            return res.status(200).json({ ok: true });
        }

        if (req.method === 'DELETE') {
            const { id } = req.query;
            const data = await redis.get('reminders');
            const reminders = data ? JSON.parse(data) : [];

            if (id) {
                const idx = reminders.findIndex(r => r.id === id);
                if (idx >= 0) reminders[idx].cancelled = true;
            } else {
                reminders.forEach(r => r.cancelled = true);
            }

            await redis.set('reminders', JSON.stringify(reminders));
            return res.status(200).json({ ok: true });
        }

        return res.status(405).json({ error: 'Método não permitido' });

    } catch (err) {
        return res.status(500).json({ error: 'Erro no Banco', message: err.message });
    } finally {
        if (redis) redis.quit();
    }
}
