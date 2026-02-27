// ═══════════════════════════════════════════════════════════════
// SERVICE WORKER — Tarefas PWA
// Suporta notificações mesmo com a aba fechada:
//   1. A página envia uma mensagem {type:'SCHEDULE', task, ms}
//   2. O SW usa setTimeout internamente para disparar a notificação
//   3. Fila de emails pendentes armazenada via IDB
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = 'tarefas-v1';
const _swTimers = {};

// ── Instalação / Ativação ───────────────────────────────────────
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// ── Recebe mensagens da página ──────────────────────────────────
self.addEventListener('message', event => {
  const msg = event.data;
  if (!msg || !msg.type) return;

  if (msg.type === 'SCHEDULE') {
    // Agendar notificação
    const { task, ms } = msg;
    if (_swTimers[task.id]) {
      clearTimeout(_swTimers[task.id]);
      delete _swTimers[task.id];
    }
    if (ms <= 0 || ms > 30 * 86400 * 1000) return;

    _swTimers[task.id] = setTimeout(() => {
      delete _swTimers[task.id];
      self.registration.showNotification('⏰ ' + task.title, {
        body: (task.time ? task.time + ' — ' : '') +
              (task.categoryLabel || '') +
              (task.notes ? ' • ' + task.notes.slice(0, 80) : ''),
        tag: 'task-' + task.id,
        requireInteraction: true,
        silent: false,
        data: { taskId: task.id }
      });
    }, ms);
  }

  if (msg.type === 'CANCEL') {
    // Cancelar agendamento
    const { taskId } = msg;
    if (_swTimers[taskId]) {
      clearTimeout(_swTimers[taskId]);
      delete _swTimers[taskId];
    }
  }

  if (msg.type === 'CANCEL_ALL') {
    Object.keys(_swTimers).forEach(id => {
      clearTimeout(_swTimers[id]);
      delete _swTimers[id];
    });
  }
});

// ── Clique na notificação ──────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const taskId = event.notification.data && event.notification.data.taskId;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Foca janela existente
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      // Abre nova janela
      return clients.openWindow(self.registration.scope);
    })
  );
});
