/**
 * Header chat chip (collaboration spec v3 17bd, 17be g): on a synced project
 * with at least one other member, a chat button with the unread count; a
 * click opens the chat window or brings it back to the front. The chat
 * itself lives in the main process (electron/sync/chat.js) and its window
 * (src/chat/).
 *
 * Also the main window's side of the chat window's questions: what is
 * selected (link to selection, 17bf e), the names of linked spots and
 * micrographs, and selecting a linked item when it is clicked there.
 */

import { useEffect, useState } from 'react';
import { Badge, IconButton, Tooltip } from '@mui/material';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import { useAppStore } from '@/store';
import { findMicrographById, findSpotById } from '@/store/helpers';

/** A linked item as this copy has it (name null = not here) */
function resolveRef(ref: ChatRef): ResolvedChatRef {
  const project = useAppStore.getState().project;
  if (ref.type === 'spot') {
    const spot = findSpotById(project, ref.id);
    return { type: 'spot', id: ref.id, name: spot ? spot.name ?? '' : null };
  }
  const m = findMicrographById(project, ref.id);
  return { type: 'micrograph', id: ref.id, name: m ? m.name ?? '' : null };
}

/** The selected spot, else the micrograph on screen; null when neither */
function currentSelection(): ResolvedChatRef | null {
  const s = useAppStore.getState();
  if (s.activeSpotId) {
    const r = resolveRef({ type: 'spot', id: s.activeSpotId });
    if (r.name !== null) return r;
  }
  if (s.activeMicrographId) {
    const r = resolveRef({ type: 'micrograph', id: s.activeMicrographId });
    if (r.name !== null) return r;
  }
  return null;
}

function isRef(x: unknown): x is ChatRef {
  const r = x as ChatRef;
  return !!r && (r.type === 'spot' || r.type === 'micrograph') && typeof r.id === 'string';
}

export function ChatChip() {
  const projectId = useAppStore((s) => s.project?.id ?? null);
  const [state, setState] = useState<ChatState | null>(null);

  // The chat window asks; a click on a link there selects the item here
  useEffect(() => {
    const api = window.api;
    if (!api) return undefined;
    const offReq = api.chatWindow.onRequest((kind, payload) => {
      if (kind === 'selection') return currentSelection();
      if (kind === 'resolve' && Array.isArray(payload)) return payload.filter(isRef).map(resolveRef);
      return null;
    });
    const offSel = api.chatWindow.onSelectRef((ref) => {
      const app = useAppStore.getState();
      if (ref.type === 'spot') void app.selectActiveSpot(ref.id);
      else if (ref.type === 'micrograph') void app.selectMicrograph(ref.id);
    });
    return () => {
      offReq();
      offSel();
    };
  }, []);

  useEffect(() => {
    setState(null);
    const api = window.api;
    if (!api || !projectId) return undefined;
    void api.chat.state(projectId).then((s) => setState((cur) => cur ?? s));
    return api.chat.onEvent((e) => {
      if (e.projectId === projectId && e.type === 'state') setState(e.state);
    });
  }, [projectId]);

  // 17be g: no chip on a solo project
  if (!state || state.status === 'removed' || (state.others ?? 0) === 0) return null;

  const unread = state.unread;
  const label = unread === 0 ? 'Chat' : `Chat: ${unread} unread ${unread === 1 ? 'message' : 'messages'}`;
  return (
    <Tooltip title={label}>
      <IconButton
        color="inherit"
        size="small"
        aria-label={label}
        data-testid="chat-chip"
        onClick={() => void window.api?.chatWindow.open()}
        sx={{ mr: 0.5 }}
      >
        <Badge badgeContent={unread} color="primary" max={99}>
          <ChatBubbleOutlineIcon fontSize="small" />
        </Badge>
      </IconButton>
    </Tooltip>
  );
}
