export default async function handler(req, res) {
    // 1. Pegar a senha de forma ultra flexível
    const rawAuth = (req.headers.authorization || '').trim();
    // Remove "Bearer " se existir para comparar só a senha pura
    const authHeader = rawAuth.replace(/Bearer\s+/i, '').trim();
    const secret = (process.env.CRON_SECRET || '').trim();

    // 2. Bloquear acesso não autorizado (com log para o usuário ver)
    if (authHeader !== secret && req.headers['x-vercel-cron'] !== 'true') {
        return res.status(401).json({
            error: 'Não autorizado',
            recebido: authHeader || "(vazio)",
            esperado: secret.substring(0, 2) + "***",
            dica: "A senha no Cron-job deve ser igual a CRON_SECRET na Vercel"
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
