import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/session';
import { Avatar, Badge, EmptyState, ErrorNote, SectionHeader, Skeleton, useAsync, useToast } from '../components/ui';
import { count, timeAgo } from '../lib/format';

interface Experience {
  id: string;
  title: string;
  description: string;
  type: string;
  cover_url: string;
  created_at: string;
  handle: string;
  display_name: string;
  avatar_color: string;
  play_count: number;
  data: string | null;
}

interface Question {
  prompt: string;
  options: string[];
  answer?: number;
}

export default function ExperienceDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  const data = useAsync(() => api.get<{ experience: Experience }>(`/content/experiences/${id}`), [id]);
  const experience = data.data?.experience;

  const questions = useMemo<Question[]>(() => {
    if (!experience?.data) return [];
    try {
      const parsed = JSON.parse(experience.data) as { questions?: Question[] };
      return Array.isArray(parsed.questions) ? parsed.questions : [];
    } catch {
      return [];
    }
  }, [experience?.data]);

  const record = async (finalScore: number) => {
    if (!user) return;
    try {
      await api.post(`/content/experiences/${id}/play`, { score: finalScore });
    } catch {
      /* play counts are best-effort telemetry */
    }
  };

  const answer = (optionIndex: number) => {
    if (picked !== null) return;
    setPicked(optionIndex);
    const question = questions[index];
    const correct = question.answer === undefined ? optionIndex === 0 : question.answer === optionIndex;
    const nextScore = score + (correct ? 1 : 0);
    setScore(nextScore);
    setTimeout(() => {
      if (index + 1 >= questions.length) {
        setDone(true);
        void record(nextScore);
        toast.push(`Finished with ${nextScore}/${questions.length}`, 'success');
      } else {
        setIndex(index + 1);
        setPicked(null);
      }
    }, 650);
  };

  if (data.loading) return <Skeleton className="h-[60vh] w-full" />;
  if (data.error) return <ErrorNote message={data.error} onRetry={data.reload} />;
  if (!experience) return <EmptyState title="Experience not found" body="It may have been unpublished." action={<Link to="/create" className="btn-primary text-xs">Browse creations</Link>} />;

  const question = questions[index];

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl border border-white/10">
        <img src={experience.cover_url} alt="" className="h-48 w-full object-cover sm:h-64" />
        <div className="absolute inset-0 bg-gradient-to-t from-midnight via-midnight/50 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
          <Badge tone="violet">{experience.type}</Badge>
          <h1 className="mt-2 font-display text-2xl font-extrabold text-white">{experience.title}</h1>
          <p className="text-xs text-white/60">{experience.description}</p>
          <div className="mt-2 flex items-center gap-2">
            <Avatar name={experience.display_name} color={experience.avatar_color} size={22} />
            <Link to={`/u/${experience.handle}`} className="text-[11px] text-white/70">@{experience.handle}</Link>
            <span className="text-[10px] text-muted">· {count(experience.play_count)} plays · {timeAgo(experience.created_at)}</span>
          </div>
        </div>
      </div>

      {questions.length === 0 && (
        <EmptyState
          title="This creation has no rounds yet"
          body="The creator published it as a concept card. Open Create to publish your own scored quiz or poll."
          action={<Link to="/create" className="btn-primary text-xs">Open Create</Link>}
        />
      )}

      {questions.length > 0 && !done && question && (
        <div className="card p-5">
          <div className="flex items-center justify-between text-[11px] text-muted">
            <span>Round {index + 1} of {questions.length}</span>
            <span>Score {score}</span>
          </div>
          <h2 className="mt-2 font-display text-lg font-bold text-white">{question.prompt}</h2>
          <div className="mt-3 grid gap-2">
            {question.options.map((option, optionIndex) => {
              const isPicked = picked === optionIndex;
              return (
                <button
                  key={`${option}-${optionIndex}`}
                  type="button"
                  onClick={() => answer(optionIndex)}
                  className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                    isPicked ? 'border-cyan-300/70 bg-cyan-400/15 text-white' : 'border-white/10 text-white/80 hover:border-violet-400/50'
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {done && (
        <div className="card p-6 text-center">
          <p className="font-display text-3xl font-extrabold text-white">{score}/{questions.length}</p>
          <p className="mt-1 text-sm text-muted">Run recorded. Replays are counted but never inflate leaderboards.</p>
          <button type="button" className="btn-primary mt-3 text-xs" onClick={() => { setIndex(0); setScore(0); setPicked(null); setDone(false); }}>
            Play again
          </button>
        </div>
      )}
    </div>
  );
}
