import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: 80,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // never returned unless explicitly requested
    },
  },
  { timestamps: true }
);

/**
 * Hash the password before persisting. We store the plain password on a
 * virtual `password` field so callers never touch bcrypt directly.
 */
userSchema.virtual('password').set(function setPassword(plain) {
  this._plainPassword = plain;
});

// Must be pre-validate, not pre-save: Mongoose runs validation first, and
// `passwordHash` is required, so it has to exist by the time validation runs.
userSchema.pre('validate', async function hashPassword(next) {
  if (!this._plainPassword) return next();
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(this._plainPassword, salt);
  this._plainPassword = undefined;
  next();
});

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

// Strip sensitive fields from every JSON response.
userSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    delete ret._id;
    return ret;
  },
});

export default mongoose.model('User', userSchema);
