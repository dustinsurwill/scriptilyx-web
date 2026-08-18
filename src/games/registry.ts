import type { Game } from '../types/game'
import { spaceEngineersGame } from './space-engineers'

export const games: Record<string, Game> = {
  [spaceEngineersGame.id]: spaceEngineersGame,
}

export const gameList: Game[] = Object.values(games)

export function getGame(id: string): Game | undefined {
  return games[id]
}
