import Project from '../models/Project.js';
import Sprint from '../models/Sprint.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import { ApiError, asyncHandler } from '../middleware/error.js';

/** Derives a 2-4 letter project key from the name, e.g. "Payments API" -> "PA". */
function deriveKey(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.map((w) => w[0]).join('').toUpperCase();
  if (initials.length >= 2) return initials.slice(0, 4);
  return name.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() || 'PRJ';
}

export const listProjects = asyncHandler(async (req, res) => {
  const projects = await Project.find({ 'members.user': req.user.id })
    .populate('owner', 'name email')
    .populate('members.user', 'name email')
    .sort({ updatedAt: -1 });

  // Attach lightweight per-project counts for the dashboard cards.
  const withStats = await Promise.all(
    projects.map(async (p) => {
      const [total, done] = await Promise.all([
        Task.countDocuments({ project: p._id }),
        Task.countDocuments({ project: p._id, status: 'done' }),
      ]);
      return { ...p.toJSON(), stats: { total, done } };
    })
  );

  res.json({ projects: withStats });
});

export const createProject = asyncHandler(async (req, res) => {
  const { name, description, key } = req.body;
  if (!name || !name.trim()) throw new ApiError(400, 'Project name is required');

  const project = await Project.create({
    name: name.trim(),
    key: (key && key.trim()) || deriveKey(name),
    description: description || '',
    owner: req.user.id,
    members: [{ user: req.user.id, role: 'owner' }],
  });

  await project.populate([
    { path: 'owner', select: 'name email' },
    { path: 'members.user', select: 'name email' },
  ]);

  res.status(201).json({ project: project.toJSON() });
});

export const getProject = asyncHandler(async (req, res) => {
  await req.project.populate([
    { path: 'owner', select: 'name email' },
    { path: 'members.user', select: 'name email' },
  ]);
  res.json({ project: req.project.toJSON() });
});

export const updateProject = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  if (name !== undefined) req.project.name = name.trim();
  if (description !== undefined) req.project.description = description;

  await req.project.save();
  await req.project.populate([
    { path: 'owner', select: 'name email' },
    { path: 'members.user', select: 'name email' },
  ]);

  res.json({ project: req.project.toJSON() });
});

export const deleteProject = asyncHandler(async (req, res) => {
  // Remove dependent documents so no orphaned sprints/tasks are left behind.
  await Promise.all([
    Task.deleteMany({ project: req.project._id }),
    Sprint.deleteMany({ project: req.project._id }),
  ]);
  await req.project.deleteOne();

  res.json({ message: 'Project deleted' });
});

export const addMember = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) throw new ApiError(400, 'An email address is required');

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) throw new ApiError(404, 'No account is registered with that email');

  if (req.project.hasMember(user.id)) {
    throw new ApiError(409, 'That person is already a member of this project');
  }

  req.project.members.push({ user: user.id, role: 'member' });
  await req.project.save();
  await req.project.populate([
    { path: 'owner', select: 'name email' },
    { path: 'members.user', select: 'name email' },
  ]);

  res.status(201).json({ project: req.project.toJSON() });
});

export const removeMember = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (req.project.isOwner(userId)) {
    throw new ApiError(400, 'The project owner cannot be removed');
  }
  if (!req.project.hasMember(userId)) {
    throw new ApiError(404, 'That person is not a member of this project');
  }

  req.project.members = req.project.members.filter((m) => m.user.toString() !== userId);
  await req.project.save();

  // Leave their tasks in place but drop the now-invalid assignment.
  await Task.updateMany(
    { project: req.project._id, assignee: userId },
    { $set: { assignee: null } }
  );

  await req.project.populate([
    { path: 'owner', select: 'name email' },
    { path: 'members.user', select: 'name email' },
  ]);

  res.json({ project: req.project.toJSON() });
});
