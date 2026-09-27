import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  inviteMemberSchema,
  createUserSchema,
} from '@taskflow/contract';

// An email address is an account identity, so every way one enters the API
// lowercases it: otherwise "Alice@x.com" could register a second account next
// to "alice@x.com", and sign-in depended on typing the original case.
describe('email addresses are lowercased on the way in', () => {
  const mixed = 'Alice.Smith@Example.COM';

  it.each([
    ['login', () => loginSchema.parse({ email: mixed, password: 'x' })],
    ['register', () => registerSchema.parse({ email: mixed, password: 'Password123!', name: 'Alice' })],
    ['forgot password / resend', () => forgotPasswordSchema.parse({ email: mixed })],
    ['workspace invite', () => inviteMemberSchema.parse({ email: mixed })],
    ['admin create user', () => createUserSchema.parse({ email: mixed, name: 'Alice' })],
  ])('%s', (_label, parse) => {
    expect(parse().email).toBe('alice.smith@example.com');
  });
});
