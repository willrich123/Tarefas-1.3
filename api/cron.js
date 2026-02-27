export default async function handler(req, res) {
    // 1. Pegar a senha com segurança (sem dar erro se estiver vazia)
    const authHeader = (req.headers.authorization || '');
    const secret = (process.env.CRON_SECRET || '');

    // 2. Bloquear acesso não autorizado
    if (authHeader.trim() !== `Bearer ${secret.trim()}` && req.headers['x-vercel-cron'] !== 'true') {
        return res.status(401).json({
            error: 'Não autorizado',
            motivo: !secret ? 'Senha não configurada na Vercel' : 'Senha incorreta'
        });
    }

    try {
        const now = new Date();

        // 3. Pegar lembretes via Fetch (mais estável que pacotes)
        const kvUrl = `${process.env.KV_REST_API_URL}/get/reminders`;
        const kvRes = await fetch(kvUrl, {
            headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
        });
        const kvData = await kvRes.json();
        let reminders = kvData.result ? JSON.parse(kvData.result) : [];

        let changed = false;
        const EMAILJS = {
            serviceId: 'service_46es4j2',
            templateId: 'template_cluuomn',
            publicKey: 'eQc4bsSrH6dLj36Jl',
            toEmail: 'Willricheduardo17@gmail.com, analuizaschug7@gmail.com',
            apiUrl: 'https://api.emailjs.com/api/v1.0/email/send',
        };

        // 4. Verificar quem precisa de email
        for (const r of reminders) {
            if (r.sent || r.cancelled) continue;

            const dt = new Date(`${r.date}T${r.time || '09:00'}:00`);
            const diffMs = dt - now;

            if (diffMs <= 60000 && diffMs > -300000) {
                // Enviar via Fetch
                const emailRes = await fetch(EMAILJS.apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        service_id: EMAILJS.serviceId,
                        template_id: EMAILJS.templateId,
                        user_id: EMAILJS.publicKey,
                        template_params: {
                            titulo: r.title || 'Tarefa',
                            data: r.date || '—',
                            hora: r.time || '—',
                            categoria: r.category || '—',
                            prioridade: r.priority || '—',
                            notas: r.notes || '—',
                            to_email: EMAILJS.toEmail,
                            nome: 'Eduardo',
                        },
                    })
                });

                if (emailRes.ok) {
                    r.sent = true;
                    r.sentAt = new Date().toISOString();
                    changed = true;
                }
            }
        }

        // 5. Salvar de volta se mudou
        if (changed) {
            await fetch(`${process.env.KV_REST_API_URL}/set/reminders`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
                body: JSON.stringify(reminders)
            });
        }

        return res.status(200).json({ ok: true, processed: changed });

    } catch (err) {
        console.error("Erro Fatal:", err.message);
        return res.status(500).json({ error: 'Erro Interno', message: err.message });
    }
}
