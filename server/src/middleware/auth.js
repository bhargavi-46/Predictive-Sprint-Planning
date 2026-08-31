import User from '../models/User.js';
import Project from '../models/Project.js';
import { verifyToken } from '../utils/token.js';
import { ApiError } from './error.js';

/**
 * Verifies the bearer token and attaches the authenticated user to req.user.
 */
export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      throw new ApiError(401, 'Authentication required');
    }

    const payload = verifyToken(header.slice(7));
    const user = await User.findById(payload.sub);
    if (!user) throw new ApiError(401, 'Account no longer exists');

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(new ApiError(401, 'Session expired, please sign in again'));
    }
    next(err);
  }
}

/**
 * Loads the project named by :projectId and confirms the caller belongs to it.
 * Attaches the document to req.project so handlers do not re-query.
 */
export async function requireProjectMember(req, _res, next) {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) throw new ApiError(404, 'Project not found');

    if (!project.hasMember(req.user.id)) {
      // 404 rather than 403: never reveal that a project exists to outsiders.
      throw new ApiError(404, 'Project not found');
    }

    req.project = project;
    next();
  } catch (err) {
    if (err.name === 'CastError') return next(new ApiError(404, 'Project not found'));
    next(err);
  }
}

/** Stricter guard for destructive project-level operations. */
export function requireProjectOwner(req, _res, next) {
  if (!req.project.isOwner(req.user.id)) {
    return next(new ApiError(403, 'Only the project owner can perform this action'));
  }
  next();
}
