import { useEffect, useMemo, useRef, useState } from 'react';
import { NEON, type GameProps } from './types';

interface Question {
  q: string;
  options: string[];
  answer: number;
}

const TRIVIA: Question[] = [
  { q: 'Which engine renders the NEXUS Grid District racer?', options: ['Three.js WebGL', 'CSS transforms', 'Animated GIFs', 'SVG filters'], answer: 0 },
  { q: 'What is the fastest way to gain XP on NEXUS?', options: ['Refresh the page', 'Verified runs + achievements', 'Idling in menus', 'Liking your own post'], answer: 1 },
  { q: 'Which colour pair leads the NEXUS accent palette?', options: ['Olive & beige', 'Cyan & magenta', 'Brown & grey', 'Pastel pink only'], answer: 1 },
  { q: 'Scores on NEXUS are validated…', options: ['Never', 'In the browser only', 'Server-side before saving', 'By your friends'], answer: 2 },
  { q: 'NEXUS Game Studio saves projects as…', options: ['Local screenshots', 'Scene JSON in the database', 'Printed QR codes', 'Email attachments'], answer: 1 },
  { q: 'Which is a real NEXUS social feature?', options: ['Ghost followers', 'Fake online counters', 'Communities with roles', 'Auto-generated users'], answer: 2 },
];

const REACTIONS = 3;
const GUESSES = 2;

type Phase = 'trivia' | 'reaction' | 'guess' | 'done';

export default function Party({ paused, onFinish }: GameProps) {
  const [phase, setPhase] = useState<Phase>('trivia');
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [reaction, setReaction] = useState<{ state: 'idle' | 'wait' | 'go' | 'done'; at: number; best: number; round: number }>({
    state: 'idle', at: 0, best: 0, round: 0,
  });
  const [guess, setGuess] = useState<{ target: number; tries: number; hint: string; done: boolean }>({ target: 0, tries: 0, hint: '', done: false });
  const [input, setInput] = useState('');
  const timerRef = useRef<number | null>(null);
  const startedAt = useRef(Date.now());

  const question = TRIVIA[index % TRIVIA.length];

  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

  const answer = (option: number) => {
    if (locked || paused) return;
    setLocked(true);
    const correct = option === question.answer;
    const gained = correct ? 300 + Math.max(0, 120 - Math.round((Date.now() - startedAt.current) / 100)) : 0;
    setScore((value) => value + gained);
    setFeedback(correct ? `Correct · +${gained}` : `Wrong — answer: ${question.options[question.answer]}`);
    window.setTimeout(() => {
      setFeedback(null);
      setLocked(false);
      startedAt.current = Date.now();
      if (index + 1 >= 5) setPhase('reaction');
      else setIndex(index + 1);
    }, 900);
  };

  const startReaction = () => {
    if (paused) return;
    setReaction((value) => ({ ...value, state: 'wait', at: 0 }));
    const delay = 900 + Math.random() * 1600;
    timerRef.current = window.setTimeout(() => {
      setReaction((value) => ({ ...value, state: 'go', at: performance.now() }));
    }, delay);
  };

  const hitReaction = () => {
    if (reaction.state === 'wait') {
      setFeedback('Too early — that round is void');
      setReaction((value) => ({ ...value, state: 'idle', round: value.round + 1 }));
      return;
    }
    if (reaction.state !== 'go') return;
    const ms = Math.round(performance.now() - reaction.at);
    const gained = Math.max(0, 500 - ms * 2);
    setScore((value) => value + gained);
    setFeedback(`${ms}ms · +${gained}`);
    const nextRound = reaction.round + 1;
    if (nextRound >= REACTIONS) {
      window.setTimeout(() => setPhase('guess'), 800);
      setReaction({ state: 'idle', at: 0, best: Math.min(reaction.best || ms, ms), round: nextRound });
    } else {
      setReaction({ state: 'idle', at: 0, best: Math.min(reaction.best || ms, ms), round: nextRound });
    }
  };

  const submitGuess = () => {
    if (guess.done || paused) return;
    const value = Number(input);
    if (!Number.isFinite(value)) return;
    const target = guess.target || Math.floor(1 + Math.random() * 100);
    const tries = guess.tries + 1;
    if (value === target) {
      const gained = 700 - (tries - 1) * 250;
      setScore((total) => total + Math.max(100, gained));
      setGuess({ target, tries, hint: `Exact — it was ${target}`, done: true });
      setFeedback(`+${Math.max(100, gained)}`);
      window.setTimeout(() => setPhase('done'), 800);
      return;
    }
    const hint = value < target ? 'Higher' : 'Lower';
    if (tries >= GUESSES) {
      setGuess({ target, tries, hint: `Out of guesses — it was ${target}`, done: true });
      window.setTimeout(() => setPhase('done'), 900);
      return;
    }
    setGuess({ target, tries, hint });
    setInput('');
  };

  useEffect(() => {
    if (phase !== 'done') return;
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    onFinish({
      score: Math.round(score),
      meta: `Party · ${durationSeconds}s · trivia ${Math.min(5, index + 1)}/5`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const progress = useMemo(() => {
    if (phase === 'trivia') return ((index) / 5) * 40;
    if (phase === 'reaction') return 40 + (reaction.round / REACTIONS) * 30;
    if (phase === 'guess') return 70 + (guess.tries / GUESSES) * 30;
    return 100;
  }, [phase, index, reaction.round, guess.tries]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center overflow-auto bg-[#070417] p-4 text-white">
      <div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: `radial-gradient(circle at 20% 20%, ${'#1a1258'} 0%, transparent 55%), radial-gradient(circle at 80% 70%, #3b1d63 0%, transparent 60%)` }} />
      <div className="relative w-full max-w-2xl">
        <div className="mb-4 flex items-center justify-between text-xs text-white/60">
          <span className="font-display text-sm font-bold text-white">NEXUS PARTY</span>
          <span>SCORE {score}</span>
        </div>
        <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: `linear-gradient(90deg, #22d3ee, #d946ef)` }} />
        </div>

        {phase === 'trivia' && (
          <div className="card p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200/80">Trivia {index + 1}/5</p>
            <h2 className="mt-2 font-display text-xl font-bold leading-snug">{question.q}</h2>
            <div className="mt-4 grid gap-2">
              {question.options.map((option, optionIndex) => (
                <button
                  key={option}
                  type="button"
                  disabled={locked || paused}
                  onClick={() => answer(optionIndex)}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm transition hover:border-cyan-300/50 hover:bg-cyan-400/10 disabled:opacity-60"
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        )}

        {phase === 'reaction' && (
          <div className="card p-5 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200/80">Reaction {Math.min(REACTIONS, reaction.round + 1)}/{REACTIONS}</p>
            <button
              type="button"
              onClick={reaction.state === 'idle' ? startReaction : hitReaction}
              className={`mt-4 h-48 w-full rounded-2xl border text-2xl font-bold transition ${
                reaction.state === 'go'
                  ? 'border-cyan-300 bg-cyan-400/25 text-cyan-100'
                  : reaction.state === 'wait'
                    ? 'border-rose-400/60 bg-rose-500/15 text-rose-200'
                    : 'border-white/10 bg-white/[0.04] text-white/70'
              }`}
            >
              {reaction.state === 'idle' ? 'Tap to start round' : reaction.state === 'wait' ? 'Wait for green…' : 'TAP NOW'}
            </button>
            <p className="mt-3 text-xs text-white/50">Best {reaction.best ? `${reaction.best}ms` : '—'}</p>
          </div>
        )}

        {phase === 'guess' && (
          <div className="card p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200/80">Number guess</p>
            <h2 className="mt-2 font-display text-xl font-bold">Pick a number between 1 and 100</h2>
            <p className="mt-1 text-xs text-white/50">Two guesses. {guess.hint}</p>
            <div className="mt-4 flex gap-2">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value.replace(/[^0-9]/g, ''))}
                inputMode="numeric"
                className="input flex-1 text-center text-lg"
                placeholder="?"
                disabled={guess.done || paused}
              />
              <button type="button" onClick={submitGuess} disabled={guess.done || paused || !input} className="btn-primary px-5">
                Guess
              </button>
            </div>
          </div>
        )}

        {phase === 'done' && (
          <div className="card p-6 text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-white/40">Run complete</p>
            <p className="mt-2 font-display text-4xl font-extrabold text-cyan-200">{score}</p>
            <p className="mt-1 text-xs text-white/50">Scores are verified server-side before they reach the leaderboard.</p>
          </div>
        )}

        {feedback && <p className="mt-4 text-center text-sm font-semibold text-white/80">{feedback}</p>}
        <p className="mt-5 text-center text-[11px] text-white/30">Trivia · reaction · number guess — three quick rounds, one score.</p>
        <p className="mt-1 text-center text-[10px] text-white/20" style={{ color: `#${NEON.violet.toString(16)}` }}>NEXUS Party</p>
      </div>
    </div>
  );
}
