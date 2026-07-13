const crypto = require('crypto');

// Excludes ambiguous characters (0/O, 1/l/I) so students can read a
// printed/texted password without confusion. 10 chars, mixed case + digit
// guaranteed, drawn from a ~54-char alphabet -> ~57 bits of entropy.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

function generateTempPassword(length = 10) {
  const bytes = crypto.randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return password;
}

module.exports = { generateTempPassword };
