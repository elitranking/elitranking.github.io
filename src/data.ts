/**
 * Laddar de statiska ögonblicksbilder som nattjobbet lägger under /data.
 *
 * Sajten gör inga API-anrop mot WTT: dels blockerar CORS det, dels blir det
 * snabbare och mer förutsägbart att servera färdig data.
 */
import type { DataBundle, Player, SubEvent, TournamentEvent } from "./engine/types";

const base = import.meta.env.BASE_URL;

async function json<T>(path: string): Promise<T> {
  const res = await fetch(`${base}data/${path}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${res.status} för ${path}`);
  return res.json() as Promise<T>;
}

export async function loadData(): Promise<DataBundle> {
  const [meta, events, ms, ws] = await Promise.all([
    json<DataBundle["meta"]>("meta.json"),
    json<TournamentEvent[]>("events.json"),
    json<Player[]>("ranking-MS.json"),
    json<Player[]>("ranking-WS.json"),
  ]);
  return { meta, events, rankings: { MS: ms, WS: ws } as Record<SubEvent, Player[]> };
}
