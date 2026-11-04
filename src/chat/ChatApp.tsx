/**
 * The chat window (collaboration spec v3 17bd-17bi): the messages of the
 * project open in the main window, and a box to write. Everything comes
 * from the main process (window.api.chat): this page never talks to the
 * server and never reads the project. Names of linked spots and
 * micrographs, and the current selection, come from the main window
 * (window.api.chatWindow.resolve / selection).
 *
 * Read: messages count as read while this window has the focus and the
 * list is scrolled to the bottom (the chip's count drops, 17bg d).
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Divider, IconButton, TextField, Tooltip, Typography,
} from '@mui/material';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import LinkIcon from '@mui/icons-material/Link';
import SendIcon from '@mui/icons-material/Send';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { presenceColor } from '@/utils/presence';
import {
  CHAT_MAX_CHARS, charCount, chatLines, newestId, outgoingNote, refKey, refLabel, splitLinks, timeLabel,
} from '@/utils/chatText';

const NEAR_BOTTOM_PX = 48;
const MAX_REFS = 10;

export function ChatApp() {
  const api = window.api;
  const [ctx, setCtx] = useState<ChatWindowContext | null>(null);
  const [state, setState] = useState<ChatState | null>(null);
  const [pinned, setPinned] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftRefs, setDraftRefs] = useState<ChatRef[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, ResolvedChatRef>>({});
  const [focused, setFocused] = useState(() => document.hasFocus());
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const listRef = useRef<HTMLDivElement | null>(null);
  const atBottom = useRef(true);
  const projectId = ctx?.projectId ?? null;

  // Which project (the main window's), and its chat
  useEffect(() => {
    if (!api) return undefined;
    void api.chatWindow.context().then(setCtx);
    void api.chatWindow.pinned().then(setPinned);
    return api.chatWindow.onContext(setCtx);
  }, [api]);

  useEffect(() => {
    document.title = ctx?.name ? `Chat: ${ctx.name}` : 'Chat';
    setState(null);
    setNames({});
    if (!api || !projectId) return undefined;
    void api.chat.state(projectId).then((s) => setState((cur) => cur ?? s));
    return api.chat.onEvent((e) => {
      if (e.projectId === projectId && e.type === 'state') setState(e.state);
    });
  }, [api, projectId, ctx?.name]);

  useEffect(() => {
    const on = () => setFocused(true);
    const off = () => setFocused(false);
    window.addEventListener('focus', on);
    window.addEventListener('blur', off);
    // "trying again in N s" counts down
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.removeEventListener('focus', on);
      window.removeEventListener('blur', off);
      clearInterval(tick);
    };
  }, []);

  // Names of linked items, from the main window's copy (again on focus: they may have changed)
  const allRefs = useMemo(() => {
    const out = new Map<string, ChatRef>();
    for (const m of state?.messages ?? []) for (const r of m.refs) out.set(refKey(r), r);
    for (const o of state?.outbox ?? []) for (const r of o.refs) out.set(refKey(r), r);
    for (const r of draftRefs) out.set(refKey(r), r);
    return [...out.values()];
  }, [state, draftRefs]);
  const resolveAll = useCallback(async (refs: ChatRef[]) => {
    if (!api || refs.length === 0) return;
    const got = await api.chatWindow.resolve(refs);
    if (!got) return;
    setNames((cur) => {
      const next = { ...cur };
      for (const r of got) next[refKey(r)] = r;
      return next;
    });
  }, [api]);
  useEffect(() => {
    const missing = allRefs.filter((r) => !(refKey(r) in names));
    if (missing.length > 0) void resolveAll(missing);
  }, [allRefs, names, resolveAll]);
  useEffect(() => {
    if (focused) void resolveAll(allRefs);
    // Only on focus changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);

  const me = state?.me ?? 0;
  const lines = useMemo(() => chatLines(state?.messages ?? [], state?.lastRead ?? 0, me, new Date(now)), [state, me, now]);
  const newest = useMemo(() => newestId(state?.messages ?? []), [state]);

  // Stay at the bottom when new messages come, if the reader was there
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [lines.length, state?.outbox.length]);

  const markReadIfSeen = useCallback(() => {
    if (!api || !projectId || !state || !focused || !atBottom.current) return;
    if (newest > state.lastRead) void api.chat.markRead(projectId, newest);
  }, [api, projectId, state, focused, newest]);
  useEffect(() => {
    markReadIfSeen();
  }, [markReadIfSeen]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (atBottom.current) markReadIfSeen();
  };

  const loadOlder = async () => {
    if (!api || !projectId) return;
    const el = listRef.current;
    const before = el ? el.scrollHeight - el.scrollTop : 0;
    setLoadingOlder(true);
    try {
      await api.chat.loadOlder(projectId);
    } finally {
      setLoadingOlder(false);
    }
    // Keep the messages the reader was looking at in place
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - before;
    });
  };

  const send = async () => {
    if (!api || !projectId) return;
    const r = await api.chat.send(projectId, draft, draftRefs);
    if (!r.ok) {
      setNote(r.message);
      return;
    }
    setDraft('');
    setDraftRefs([]);
    setNote(null);
    atBottom.current = true;
  };

  const linkSelection = async () => {
    if (!api) return;
    const sel = await api.chatWindow.selection();
    if (!sel) {
      setNote('Select a spot or micrograph in the main window first.');
      return;
    }
    if (draftRefs.some((r) => refKey(r) === refKey(sel))) return;
    if (draftRefs.length >= MAX_REFS) {
      setNote(`At most ${MAX_REFS} links per message.`);
      return;
    }
    setNames((cur) => ({ ...cur, [refKey(sel)]: sel }));
    setDraftRefs((cur) => [...cur, { type: sel.type, id: sel.id }]);
    setNote(null);
  };

  const togglePin = async () => {
    if (!api) return;
    const r = await api.chatWindow.pin(!pinned);
    setPinned(r.pinned);
  };

  const chars = charCount(draft.trim());
  const tooLong = chars > CHAT_MAX_CHARS;
  const canWrite = !!state && state.status !== 'removed' && (state.others ?? 0) > 0;

  const refChip = (r: ChatRef, onDelete?: () => void) => {
    const label = refLabel(r, names[refKey(r)]);
    const gone = names[refKey(r)]?.name === null;
    return (
      <Chip
        key={refKey(r)}
        size="small"
        variant="outlined"
        icon={<LinkIcon />}
        label={label}
        disabled={gone && !onDelete}
        onClick={gone || onDelete ? undefined : () => void api?.chatWindow.selectRef(r)}
        onDelete={onDelete}
        sx={{ maxWidth: '100%', mr: 0.5, mt: 0.5 }}
      />
    );
  };

  const textOf = (m: { text: string }) => splitLinks(m.text).map((p, i) => (p.kind === 'link' ? (
    <Box
      component="a"
      key={i}
      href={p.href}
      onClick={(e: React.MouseEvent) => {
        e.preventDefault();
        void api?.openExternalLink(p.href);
      }}
      sx={{ color: 'primary.main', wordBreak: 'break-all' }}
    >
      {p.text}
    </Box>
  ) : <span key={i}>{p.text}</span>));

  // ---------------------------------------------------------------------
  let body: React.ReactNode;
  if (!projectId) {
    body = <Empty text="Open a synced project to chat with its collaborators." />;
  } else if (!state || state.status === 'loading') {
    body = <Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }}><CircularProgress size={24} /></Box>;
  } else if (state.status === 'removed') {
    body = <Empty text={state.error || 'You no longer have access to this project.'} />;
  } else if (state.status === 'offline' && state.messages.length === 0) {
    body = <Empty text="The chat cannot be reached right now. It will load when the connection is back." />;
  } else if (state.others === 0 && state.messages.length === 0) {
    body = <Empty text="Nobody else is in this project yet. Invite collaborators with File > Collaborate..., then chat with them here." />;
  } else {
    body = (
      <Box ref={listRef} onScroll={onScroll} sx={{ flex: 1, overflowY: 'auto', px: 1.5, py: 1 }} data-testid="chat-list">
        {state.hasOlder && (
          <Box sx={{ textAlign: 'center', mb: 1 }}>
            <Button size="small" onClick={() => void loadOlder()} disabled={loadingOlder}>
              {loadingOlder ? 'Loading...' : 'Load earlier messages'}
            </Button>
          </Box>
        )}
        {lines.map(({ message: m, head, day, firstNew }) => {
          const mine = m.author.pkey === me;
          const canDelete = !m.deletedAt && (mine || state.role === 'owner');
          return (
            <Box key={m.id} data-testid="chat-message" data-id={m.id}>
              {day && (
                <Divider sx={{ my: 1, fontSize: 12, color: 'text.secondary' }}>{day}</Divider>
              )}
              {firstNew && (
                <Divider sx={{ my: 1, fontSize: 12, color: 'primary.main', '&::before, &::after': { borderColor: 'primary.main' } }}>New</Divider>
              )}
              <Box sx={{ position: 'relative', mt: head ? 1 : 0.25, '&:hover .chat-actions': { opacity: 1 } }}>
                {head && (
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: presenceColor(m.author.pkey) }}>
                      {mine ? 'You' : (m.author.name || 'Someone')}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{timeLabel(m.createdAt)}</Typography>
                  </Box>
                )}
                {m.deletedAt ? (
                  <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                    {m.deletedBy && m.deletedBy.pkey !== m.author.pkey ? `Message deleted by ${m.deletedBy.pkey === me ? 'you' : m.deletedBy.name || 'the owner'}` : 'Message deleted'}
                  </Typography>
                ) : (
                  <>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', pr: canDelete ? 3 : 0 }}>{textOf(m)}</Typography>
                    {m.refs.length > 0 && <Box>{m.refs.map((r) => refChip(r))}</Box>}
                  </>
                )}
                {canDelete && (
                  <Box className="chat-actions" sx={{ position: 'absolute', top: 0, right: 0, opacity: 0, transition: 'opacity 120ms' }}>
                    <Tooltip title={mine ? 'Delete message' : 'Delete message (owner)'}>
                      <IconButton size="small" aria-label="Delete message" onClick={() => projectId && void api?.chat.deleteMessage(projectId, m.id)}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}
              </Box>
            </Box>
          );
        })}
        {state.outbox.map((o) => (
          <Box key={o.clientMsgId} sx={{ mt: 1, opacity: o.status === 'failed' ? 1 : 0.7 }} data-testid="chat-outgoing">
            <Typography variant="body2" sx={{ fontWeight: 600 }}>You</Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{o.text}</Typography>
            {o.refs.length > 0 && <Box>{o.refs.map((r) => refChip(r))}</Box>}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" sx={{ color: o.status === 'failed' ? 'error.main' : 'text.secondary' }}>
                {outgoingNote(o, now)}
              </Typography>
              {o.status !== 'sending' && (
                <>
                  <Button size="small" sx={{ minWidth: 0, p: 0 }} onClick={() => projectId && void api?.chat.retry(projectId, o.clientMsgId)}>Retry</Button>
                  <Button size="small" sx={{ minWidth: 0, p: 0 }} color="inherit" onClick={() => projectId && void api?.chat.discard(projectId, o.clientMsgId)}>Discard</Button>
                </>
              )}
            </Box>
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 0.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Typography variant="subtitle2" noWrap sx={{ flex: 1 }} title={ctx?.name || ''}>{ctx?.name || 'Chat'}</Typography>
        {state && !state.live && state.status === 'ready' && (
          <Tooltip title="Live updates paused; checking every 30 seconds">
            <Typography variant="caption" sx={{ color: 'text.secondary', mr: 1 }}>Checking every 30 s</Typography>
          </Tooltip>
        )}
        <Tooltip title={pinned ? 'Stop keeping on top' : 'Keep on top'}>
          <IconButton size="small" onClick={() => void togglePin()} aria-label={pinned ? 'Stop keeping on top' : 'Keep on top'}>
            {pinned ? <PushPinIcon fontSize="small" color="primary" /> : <PushPinOutlinedIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>
      {state?.status === 'offline' && state.messages.length > 0 && (
        <Alert severity="info" sx={{ borderRadius: 0, py: 0 }}>Offline. Messages will be sent when the connection is back.</Alert>
      )}
      {body}
      {canWrite && (
        <Box sx={{ borderTop: 1, borderColor: 'divider', p: 1, bgcolor: 'background.paper' }}>
          {note && (
            <Alert severity="info" sx={{ mb: 1, py: 0 }} action={<IconButton size="small" onClick={() => setNote(null)} aria-label="Close note"><CloseIcon fontSize="small" /></IconButton>}>
              {note}
            </Alert>
          )}
          {draftRefs.length > 0 && (
            <Box sx={{ mb: 0.5 }}>
              {draftRefs.map((r) => refChip(r, () => setDraftRefs((cur) => cur.filter((x) => refKey(x) !== refKey(r)))))}
            </Box>
          )}
          <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5 }}>
            <Tooltip title="Link the selected spot or micrograph">
              <IconButton size="small" onClick={() => void linkSelection()} aria-label="Link to selection">
                <LinkIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <TextField
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (draft.trim() !== '' && !tooLong) void send();
                }
              }}
              placeholder="Write a message"
              multiline
              maxRows={6}
              size="small"
              fullWidth
              autoFocus
              slotProps={{ htmlInput: { 'aria-label': 'Message' } }}
            />
            <Tooltip title="Send (Enter)">
              <span>
                <IconButton size="small" color="primary" onClick={() => void send()} disabled={draft.trim() === '' || tooLong} aria-label="Send">
                  <SendIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
          {chars > CHAT_MAX_CHARS - 500 && (
            <Typography variant="caption" sx={{ display: 'block', textAlign: 'right', color: tooLong ? 'error.main' : 'text.secondary' }}>
              {chars.toLocaleString('en-US')} / {CHAT_MAX_CHARS.toLocaleString('en-US')}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', p: 3 }}>
      <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center' }}>{text}</Typography>
    </Box>
  );
}
