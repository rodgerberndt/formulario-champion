/**
 * Pool de requisições do admin.
 *
 * O painel serializava TODAS as chamadas numa fila de um só lugar, para não
 * estourar a edge function com pedidos simultâneos. O efeito colateral era que
 * abrir uma tela que precisa de quatro rotas custava a soma das quatro, e não a
 * mais lenta delas: com a função em cold start isso passava de 20 segundos.
 *
 * Aqui a fila vira um semáforo com N vagas. Quatro chamadas simultâneas não
 * derrubam nada (a edge function escala por instância e o Postgres tem pool
 * próprio), e a tela passa a esperar a rota mais lenta em vez do somatório.
 *
 * A segunda diferença é a PRIORIDADE. O prefetch existe para adiantar o que a
 * pessoa provavelmente vai abrir, mas quando ela clica em algo, o clique não
 * pode ficar atrás de cinco prefetches na fila. Então:
 *
 *   - pedido do usuário  → entra na frente da fila e pode usar todas as vagas;
 *   - prefetch           → entra no fim e só ocupa vaga se sobrar folga,
 *                          deixando sempre vagas livres para um clique.
 *
 * Sem isso, adiantar dado atrasava o dado pedido — que é o oposto do objetivo.
 */

export type RequestPriority = "user" | "prefetch";

/** Vagas simultâneas. Acima disso o ganho satura e o cold start se multiplica. */
const MAX_CONCURRENT = 4;

/** Vagas que o prefetch nunca ocupa, reservadas para um clique do usuário. */
const RESERVED_FOR_USER = 2;

interface Waiter {
  priority: RequestPriority;
  start: () => void;
}

let active = 0;
const waiting: Waiter[] = [];

function slotsFor(priority: RequestPriority): number {
  return priority === "user" ? MAX_CONCURRENT : MAX_CONCURRENT - RESERVED_FOR_USER;
}

/** Acorda quem couber, respeitando o limite de cada prioridade. */
function pump(): void {
  for (let i = 0; i < waiting.length; i++) {
    const w = waiting[i];
    if (active >= slotsFor(w.priority)) continue;
    waiting.splice(i, 1);
    active++;
    w.start();
    i--;
  }
}

function acquire(priority: RequestPriority): Promise<void> {
  if (active < slotsFor(priority)) {
    active++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const waiter: Waiter = { priority, start: resolve };
    // Pedido do usuário fura a fila dos prefetches, mas nunca a de outro
    // pedido do usuário: entre iguais, a ordem de chegada é respeitada.
    if (priority === "user") {
      const firstPrefetch = waiting.findIndex((w) => w.priority === "prefetch");
      if (firstPrefetch === -1) waiting.push(waiter);
      else waiting.splice(firstPrefetch, 0, waiter);
    } else {
      waiting.push(waiter);
    }
  });
}

function release(): void {
  active = Math.max(0, active - 1);
  pump();
}

/** Roda `fn` assim que houver vaga no pool, e libera a vaga ao terminar. */
export async function runPooled<T>(
  fn: () => Promise<T>,
  priority: RequestPriority = "user",
): Promise<T> {
  await acquire(priority);
  try {
    return await fn();
  } finally {
    release();
  }
}

/** Só para diagnóstico na tela de tracking. */
export function poolStats(): { active: number; waiting: number } {
  return { active, waiting: waiting.length };
}
