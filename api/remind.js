export default async function handler(req, res) {
    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;

    const headers = { Authorization: `Bearer ${kvToken}` };

    try {
        if (req.method === 'GET') {
            const resKv = await fetch(`${kvUrl}/get/reminders`, { headers });
            const data = await resKv.json();
            const reminders = data.result ? JSON.parse(data.result) : [];
            return res.status(200).json(reminders);
        }

        if (req.method === 'POST') {
            const { id, title, date, time, category, priority, notes } = req.body;

            const resGet = await fetch(`${kvUrl}/get/reminders`, { headers });
            const dataGet = await resGet.json();
            const reminders = dataGet.result ? JSON.parse(dataGet.result) : [];

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

            await fetch(`${kvUrl}/set/reminders`, {
                method: 'POST',
                headers,
                body: JSON.stringify(reminders)
            });

            return res.status(200).json({ ok: true });
        }

        if (req.method === 'DELETE') {
            const { id } = req.query;
            const resGet = await fetch(`${kvUrl}/get/reminders`, { headers });
            const dataGet = await resGet.json();
            const reminders = dataGet.result ? JSON.parse(dataGet.result) : [];

            if (id) {
                const idx = reminders.findIndex(r => r.id === id);
                if (idx >= 0) reminders[idx].cancelled = true;
            } else {
                reminders.forEach(r => r.cancelled = true);
            }

            await fetch(`${kvUrl}/set/reminders`, {
                method: 'POST',
                headers,
                body: JSON.stringify(reminders)
            });

            return res.status(200).json({ ok: true });
        }

        return res.status(405).json({ error: 'Método não permitido' });

    } catch (err) {
        return res.status(500).json({ error: 'Erro no Banco', message: err.message });
    }
}
