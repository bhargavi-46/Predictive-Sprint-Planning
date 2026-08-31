import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { tokenStore } from '../api/client';

/**
 * Joins the websocket room for one project and forwards board events to the
 * supplied handlers. Handlers are held in a ref so that re-renders do not
 * tear down and rebuild the socket connection.
 */
export function useProjectSocket(projectId, handlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!projectId) return undefined;

    const socket = io('/', { auth: { token: tokenStore.get() } });

    socket.on('connect', () => socket.emit('project:join', projectId));

    const forward = (event) => (payload) => handlersRef.current?.[event]?.(payload);

    socket.on('task:created', forward('onTaskCreated'));
    socket.on('task:updated', forward('onTaskUpdated'));
    socket.on('task:deleted', forward('onTaskDeleted'));
    socket.on('board:reordered', forward('onBoardReordered'));
    socket.on('sprint:created', forward('onSprintChanged'));
    socket.on('sprint:updated', forward('onSprintChanged'));
    socket.on('sprint:deleted', forward('onSprintChanged'));

    return () => {
      socket.emit('project:leave', projectId);
      socket.disconnect();
    };
  }, [projectId]);
}
