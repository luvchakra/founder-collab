/**
 * Password policy for every place a password is set (signup, reset). Follows NIST SP
 * 800-63B rather than composition rules: length is what matters, arbitrary "must contain
 * a symbol" rules don't help and push users toward predictable patterns.
 *
 * - Minimum 12 characters (OWASP ASVS 2.1.1 level 2+ for an app holding financial data).
 * - Maximum 72 *bytes*: Supabase Auth hashes with bcrypt, which silently ignores
 *   everything past byte 72 -- accepting a longer password would let a user believe the
 *   tail of it matters when it doesn't.
 * - Rejects a small list of the most common passwords and passwords built from the
 *   account's own email. Supabase's "leaked password protection" (HaveIBeenPwned) setting
 *   is the broader check and should be enabled in the project's Auth settings too -- this
 *   list only catches the obvious cases without a network call.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_BYTES = 72;

const COMMON_PASSWORDS = new Set([
  "123456789012",
  "password1234",
  "password123!",
  "qwertyuiop12",
  "qwerty123456",
  "iloveyou1234",
  "letmein12345",
  "welcome12345",
  "admin1234567",
  "passw0rd1234",
  "111111111111",
  "000000000000",
  "abcdefghijkl",
  "abc123456789",
  "changeme1234",
]);

export function validatePassword(password: string, options?: { email?: string | null }): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES) {
    return `Password must be at most ${PASSWORD_MAX_BYTES} bytes.`;
  }
  const lowered = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lowered) || /^(.)\1+$/.test(password)) {
    return "That password is too common. Choose something less predictable.";
  }
  const localPart = options?.email?.split("@")[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && lowered.includes(localPart)) {
    return "Password must not contain your email address.";
  }
  return null;
}
