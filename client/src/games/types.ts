export interface GameResult {
  score: number;
  meta: string;
}

export interface GameProps {
  paused: boolean;
  quality: 'low' | 'high';
  onFinish: (result: GameResult) => void;
  onProgress?: (data: Record<string, unknown>) => void;
}

/** Shared palette so all original titles feel like one universe. */
export const NEON = {
  midnight: 0x05030f,
  indigo: 0x1a1258,
  violet: 0x7c3aed,
  magenta: 0xd946ef,
  cyan: 0x22d3ee,
  rose: 0xf43f5e,
  amber: 0xf59e0b,
  white: 0xf5f3ff,
};
