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
        // 3. Pegar horário exato de Brasília (imune ao fuso do servidor)
        const dtf = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        });
        const parts = dtf.formatToParts(new Date());
        const p = {};
        parts.forEach(({ type, value }) => p[type] = value);

        // Criar um Date que "pensa" que é Brasília
        const nowBR = new Date(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`);
        const serverTimeStr = `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;

        // 4. Conectar ao Redis usando a URL da Vercel
        const redisUrl = process.env.REDIS_URL;
        if (!redisUrl) {
            throw new Error("Variável REDIS_URL não encontrada. Conecte o Storage e faça Redeploy.");
        }

        redis = new Redis(redisUrl);

        // 5. Pegar lembretes
        const data = await redis.get('reminders');
        let reminders = data ? JSON.parse(data) : [];

        let changed = false;
        const pendingCount = reminders.filter(r => !r.sent && !r.cancelled).length;

        const EMAILJS = {
            serviceId: 'service_46es4j2',
            templateId: 'template_cluuomn',
            publicKey: 'eQc4bsSrH6dLj36Jl',
            toEmail: 'Willricheduardo17@gmail.com, analuizaschug7@gmail.com',
            apiUrl: 'https://api.emailjs.com/api/v1.0/email/send',
        };

        for (const r of reminders) {
            if (r.sent || r.cancelled) continue;

            // Criar a data da tarefa também no "fuso Brasília" para comparar igual
            const dtTask = new Date(`${r.date}T${r.time || '09:00'}:00`);
            const diffMs = dtTask - nowBR;

            // Se for nos próximos 60 segundos (ou até 5 min atrás por segurança)
            if (diffMs <= 60000 && diffMs > -300000) {
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
                }
            }
        }

        if (changed) {
            await redis.set('reminders', JSON.stringify(reminders));
        }

        return res.status(200).json({
            ok: true,
            processed: changed,
            serverTime: serverTimeStr,
            total: reminders.length,
            pending: pendingCount
        });

    } catch (err) {
        console.error("Erro Fatal:", err.message);
        return res.status(500).json({
            error: 'Erro Interno',
            message: err.message,
            orientacao: "Verifique se o REDIS_URL está correto."
        });
    } finally {
        if (redis) redis.quit();
    }
}
