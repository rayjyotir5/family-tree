// Static password for the family tree site
// Change this to your desired password
const STATIC_PASSWORD = 'family';

export function verifyPassword(password: string): boolean {
  return password === STATIC_PASSWORD;
}

export function isPasswordSet(): boolean {
  // Always return true since we use a static password
  return true;
}
