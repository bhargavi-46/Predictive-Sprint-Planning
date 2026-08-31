import User from '../models/User.js';
import { signToken } from '../utils/token.js';
import { ApiError, asyncHandler } from '../middleware/error.js';

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    throw new ApiError(400, 'Name, email and password are all required');
  }
  if (password.length < 8) {
    throw new ApiError(400, 'Password must be at least 8 characters long');
  }

  const user = new User({ name, email, password });
  await user.save();

  res.status(201).json({ token: signToken(user.id), user: user.toJSON() });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    throw new ApiError(400, 'Email and password are required');
  }

  // passwordHash is select:false, so ask for it explicitly.
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');

  // Same message for both failure modes so we do not leak which emails exist.
  if (!user || !(await user.verifyPassword(password))) {
    throw new ApiError(401, 'Incorrect email or password');
  }

  res.json({ token: signToken(user.id), user: user.toJSON() });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user.toJSON() });
});

/** Used by the "invite member" box to resolve an email to an account. */
export const searchUsers = asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 3) return res.json({ users: [] });

  const users = await User.find({
    $or: [
      { email: new RegExp(`^${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i') },
      { name: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
    ],
  }).limit(8);

  res.json({ users: users.map((u) => u.toJSON()) });
});
