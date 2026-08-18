import type { Game } from '../types/game'
import { spaceEngineersGame } from './space-engineers'
import { ic10Game } from './ic10'

export const games: Record<string, Game> = {
  [spaceEngineersGame.id]: spaceEngineersGame,
  [ic10Game.id]: ic10Game,
}

export const gameList: Game[] = Object.values(games)

export function getGame(id: string): Game | undefined {
  return games[id]
}
