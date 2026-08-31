import { Server } from 'socket.io';
import { verifyToken } from '../utils/token.js';
import Project from '../models/Project.js';
import { invalidateProject } from '../services/cache.js';

let io = null;

export function initSockets(httpServer, corsOrigin) {
  io = new Server(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
  });

  // Authenticate the socket itself; an unauthenticated socket never connects.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));
      const payload = verifyToken(token);
      socket.userId = payload.sub;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    /**
     * Rooms are per project. Membership is re-checked here rather than trusted
     * from the client, so a user cannot listen in on a project they left.
     */
    socket.on('project:join', async (projectId) => {
      try {
        const project = await Project.findById(projectId);
        if (!project || !project.hasMember(socket.userId)) return;
        socket.join(`project:${projectId}`);
      } catch {
        /* malformed id — ignore */
      }
    });

    socket.on('project:leave', (projectId) => {
      socket.leave(`project:${projectId}`);
    });
  });

  return io;
}

/**
 * Broadcasts an event to everyone currently viewing a project's board, and
 * drops that project's cached analytics.
 *
 * Invalidation lives here rather than in each controller because this function
 * is already the single choke point every mutation passes through: a write
 * that changes the board always announces itself. Scattering
 * `invalidateProject` across fourteen call sites would mean one forgotten line
 * silently serves a stale forecast — the exact class of bug that is hardest to
 * notice, since the number looks plausible.
 */
export function emitToProject(projectId, event, payload) {
  invalidateProject(projectId);
  if (!io) return; // no-op during tests
  io.to(`project:${projectId}`).emit(event, payload);
}
