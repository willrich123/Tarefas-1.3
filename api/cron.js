import Redis from 'ioredis';

export default async function handler(req, res) {
    // 1. Pegar a senha de forma ultra flexível
    const rawAuth = (req.headers.authorization || '').trim();
    const authHeader = rawAuth.replace(/Bearer\s+/i, '').trim();
    const secret = (process.env.CRON_SECRET || '').trim();

    // 2. Bloquear acesso não autorizado
    if (authHeader !== secret && req.headers['x-vercel-cron'] !== 'true') {
        return res.status(401).json({
            error: 'Não autorizado',
            recebido: authHeader || "(vazio)",
            esperado: secret.substring(0, 2) + "***",
            dica: "A senha no Cron-job deve ser igual a CRON_SECRET na Vercel"
        });
    }

    let redis;
    try {
        // 3. Pegar horário de Brasília de forma ultra-robusta
        // Vercel usa UTC. BR é UTC-3.
        const nowBR = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
        const serverTimeStr = nowBR.toLocaleString("pt-BR");

        // 4. Conectar ao Redis
        const redisUrl = process.env.REDIS_URL;
        if (!redisUrl) throw new Error("REDIS_URL não encontrada.");
        redis = new Redis(redisUrl);

        // 5. Pegar lembretes
        const data = await redis.get('reminders');
        let reminders = data ? JSON.parse(data) : [];

        let changed = false;
        let sentCount = 0;
        const EMAILJS = {
            serviceId: 'service_46es4j2',
            templateId: 'template_cluuomn',
            publicKey: 'eQc4bsSrH6dLj36Jl',
            toEmail: 'Willricheduardo17@gmail.com, analuizaschug7@gmail.com',
            apiUrl: 'https://api.emailjs.com/api/v1.0/email/send',
        };

        for (const r of reminders) {
            if (r.sent || r.cancelled) continue;

            // Data da tarefa (tratada como BR pelo servidor Vercel)
            const dtTask = new Date(`${r.date}T${r.time || '09:00'}:00`);
            const diffMs = dtTask - nowBR;

            // Se for AGORA (até 65s no futuro ou 5 min no passado)
            if (diffMs <= 65000 && diffMs > -300000) {
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
                    r.sentAt = nowBR.toISOString();
                    changed = true;
                    sentCount++;
                }
            }
        }

        if (changed) {
            await redis.set('reminders', JSON.stringify(reminders));
        }

        return res.status(200).json({
            ok: true,
            serverTime: serverTimeStr,
            sentNow: sentCount,
            totalInBank: reminders.length,
            pendingInBank: reminders.filter(r => !r.sent && !r.cancelled).length
        });

    } catch (err) {
        console.error("Cron Error:", err.message);
        return res.status(500).json({ error: 'Erro Interno', message: err.message });
    } finally {
        if (redis) redis.quit();
    }
}
