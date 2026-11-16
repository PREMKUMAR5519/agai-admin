import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
const scrypt = promisify(scryptCallback)
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = await scrypt(password, salt, 64)
  return `${salt}:${hash.toString('hex')}`
}
export async function checkPassword(password, stored) {
  const [salt, expected] = stored.split(':')
  const hash = await scrypt(password, salt, 64)
  const original = Buffer.from(expected, 'hex')
  return hash.length === original.length && timingSafeEqual(hash, original)
}
export const csrfToken = () => randomBytes(32).toString('hex')
