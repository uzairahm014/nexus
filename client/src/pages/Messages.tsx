import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/session';
import { Avatar, EmptyState, ErrorNote, Modal, Skeleton, Spinner, useToast } from '../components/ui';
import { timeAgo } from '../lib/format';

interface Conversation {
  id: string;
  title: string;
  isGroup: number;
  updated_at: string;
  last_message: string | null;
  other_handle: string | null;
  other_name: string | null;
  other_color: string | null;
  unread: number;
}

interface Message {
  id: string;
  body: string;
  created_at: string;
  handle: string;
  display_name: string;
  avatar_color: string;
  author_id: string;
}

export default function Messages() {
  const { user } = useAuth();
  const toast = useToast();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [newHandle, setNewHandle] = useState('');
  const [creating, setCreating] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupTitle, setGroupTitle] = useState('');
  const [groupHandles, setGroupHandles] = useState('');
  const [groupSaving, setGroupSaving] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadConversations = () => {
    api
      .get<{ conversations: Conversation[] }>('/social/conversations')
      .then((data) => {
        setConversations(data.conversations);
        setActiveId((current) => current ?? data.conversations[0]?.id ?? null);
      })
      .catch((err: Error) => setError(err.message));
  };

  useEffect(loadConversations, []);

  useEffect(() => {
    if (!activeId) return;
    let active = true;
    setMessages(null);
    api
      .get<{ messages: Message[] }>(`/social/conversations/${activeId}/messages`)
      .then((data) => active && setMessages(data.messages))
      .catch((err: Error) => active && setError(err.message));
    return () => {
      active = false;
    };
  }, [activeId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const active = useMemo(() => conversations?.find((conversation) => conversation.id === activeId) ?? null, [conversations, activeId]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !activeId) return;
    setSending(true);
    try {
      const response = await api.post<{ message: Message }>(`/social/conversations/${activeId}/messages`, { body });
      setMessages((current) => [...(current ?? []), response.message]);
      setDraft('');
      loadConversations();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Message failed', 'error');
    } finally {
      setSending(false);
    }
  };

  const startConversation = async () => {
    const handle = newHandle.trim().replace(/^@/, '');
    if (!handle) return;
    setCreating(true);
    try {
      const response = await api.post<{ conversation: Conversation }>('/social/conversations', { handle });
      setNewHandle('');
      setActiveId(response.conversation.id);
      loadConversations();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not start conversation', 'error');
    } finally {
      setCreating(false);
    }
  };

  if (error) return <ErrorNote message={error} onRetry={() => { setError(null); loadConversations(); }} />;

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="card flex max-h-[70vh] flex-col overflow-hidden">
        <div className="border-b border-white/5 p-3">
          <h1 className="font-display text-sm font-semibold text-white">Messages</h1>
          <div className="mt-2 flex gap-2">
            <input
              value={newHandle}
              onChange={(event) => setNewHandle(event.target.value)}
              placeholder="@handle"
              className="input flex-1 text-xs"
            />
            <button type="button" className="btn-ghost text-xs" onClick={startConversation} disabled={creating || !newHandle.trim()}>
              New
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations === null && <div className="p-3"><Skeleton className="h-12 w-full" /></div>}
          {conversations?.length === 0 && <p className="p-4 text-xs text-muted">No conversations yet. Start one with a handle.</p>}
          {(conversations ?? []).map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => setActiveId(conversation.id)}
              className={`flex w-full items-center gap-3 border-b border-white/5 px-3 py-3 text-left transition ${
                conversation.id === activeId ? 'bg-violet-500/10' : 'hover:bg-white/[0.03]'
              }`}
            >
              <Avatar
                name={conversation.title || conversation.other_name || 'Chat'}
                color={conversation.other_color || '#7c3aed'}
                size={36}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white">{conversation.title || conversation.other_name || 'Conversation'}</p>
                <p className="truncate text-[11px] text-muted">{conversation.last_message || 'No messages yet'}</p>
              </div>
              <span className="text-[10px] text-muted">{timeAgo(conversation.updated_at)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card flex max-h-[70vh] min-h-[420px] flex-col overflow-hidden">
        {!active && <div className="flex flex-1 items-center justify-center"><EmptyState title="Select a conversation" body="Messages are private between participants." /></div>}
        {active && (
          <>
            <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
              <Avatar name={active.title || active.other_name || 'Chat'} color={active.other_color || '#7c3aed'} size={30} />
              <div>
                <p className="text-xs font-semibold text-white">{active.title || active.other_name}</p>
                <p className="text-[10px] text-muted">{active.isGroup ? 'Group conversation' : `@${active.other_handle ?? 'member'}`}</p>
              </div>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages === null && <div className="flex justify-center py-6"><Spinner /></div>}
              {messages?.length === 0 && <p className="text-center text-xs text-muted">Say hello — this conversation has no messages yet.</p>}
              {(messages ?? []).map((message) => {
                const mine = message.author_id === user?.id || message.handle === user?.handle;
                return (
                  <div key={message.id} className={`flex gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                    {!mine && <Avatar name={message.display_name} color={message.avatar_color} size={26} />}
                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-xs ${mine ? 'bg-violet-500/25 text-white' : 'bg-white/[0.06] text-white/85'}`}>
                      <p className="whitespace-pre-line break-words">{message.body}</p>
                      <p className="mt-1 text-[10px] text-white/40">{timeAgo(message.created_at)}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>
            <div className="flex gap-2 border-t border-white/5 p-3">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value.slice(0, 1000))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    send();
                  }
                }}
                placeholder="Write a message…"
                className="input flex-1 text-xs"
              />
              <button type="button" className="btn-primary text-xs" onClick={send} disabled={sending || !draft.trim()}>
                Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
