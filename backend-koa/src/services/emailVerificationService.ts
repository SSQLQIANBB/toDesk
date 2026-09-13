import crypto from 'crypto';
import nodemailer from 'nodemailer';
import redis from '../config/redis';

export type EmailCodePurpose = 'register' | 'bind' | 'reset' | 'change-password';

const CODE_TTL_SECONDS = 600;
const COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 100 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function key(purpose: EmailCodePurpose, email: string, type: string) {
  const digest = crypto.createHash('sha256').update(email).digest('hex');
  return `email:${type}:${purpose}:${digest}`;
}

function codeHash(code: string) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET || 'development-email-code-key')
    .update(code).digest('hex');
}

export function isMailConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.SMTP_FROM);
}

async function sendMail(email: string, code: string, purpose: EmailCodePurpose) {
  if (!isMailConfigured()) throw new Error('邮件服务未配置');
  const port = Number(process.env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASSWORD! },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  const label: Record<EmailCodePurpose, string> = {
    register: '注册', bind: '绑定邮箱', reset: '找回密码', 'change-password': '修改密码',
  };
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: `ToDesk ${label[purpose]}验证码`,
      text: `您的 ToDesk ${label[purpose]}验证码为 ${code}，10 分钟内有效。若非本人操作，请忽略本邮件。`,
    });
  } finally {
    transport.close();
  }
}

export async function issueEmailCode(purpose: EmailCodePurpose, email: string): Promise<'sent' | 'cooldown'> {
  const cooldownKey = key(purpose, email, 'cooldown');
  const reserved = await redis.set(cooldownKey, '1', 'EX', COOLDOWN_SECONDS, 'NX');
  if (reserved !== 'OK') return 'cooldown';
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  const verificationKey = key(purpose, email, 'code');
  const attemptsKey = key(purpose, email, 'attempts');
  try {
    await redis.set(verificationKey, codeHash(code), 'EX', CODE_TTL_SECONDS);
    await redis.del(attemptsKey);
    await sendMail(email, code, purpose);
    return 'sent';
  } catch (error) {
    await redis.del(verificationKey, cooldownKey);
    throw error;
  }
}

export async function consumeEmailCode(purpose: EmailCodePurpose, email: string, code: unknown): Promise<boolean> {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return false;
  const verificationKey = key(purpose, email, 'code');
  const attemptsKey = key(purpose, email, 'attempts');
  const saved = await redis.get(verificationKey);
  if (!saved) return false;
  const attempts = await redis.incr(attemptsKey);
  if (attempts === 1) await redis.expire(attemptsKey, CODE_TTL_SECONDS);
  if (attempts > MAX_ATTEMPTS) {
    await redis.del(verificationKey);
    return false;
  }
  const expected = Buffer.from(saved, 'hex');
  const actual = Buffer.from(codeHash(code), 'hex');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return false;
  const consumed = await redis.getdel(verificationKey);
  if (consumed !== saved) return false;
  await redis.del(attemptsKey);
  return true;
}
