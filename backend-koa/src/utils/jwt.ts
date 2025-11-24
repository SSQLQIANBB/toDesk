import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'your-refresh-secret-key-change-in-production';
const ACCESS_TOKEN_EXPIRES_IN = '2h'; // access token有效期2小时
const REFRESH_TOKEN_EXPIRES_IN = '24h'; // refresh token有效期24小时

export interface JwtPayload {
  userId: number;
  username: string;
  type?: 'access' | 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * 生成 access token
 */
export function generateAccessToken(payload: JwtPayload): string {
  return jwt.sign({ ...payload, type: 'access' }, JWT_SECRET, { 
    expiresIn: ACCESS_TOKEN_EXPIRES_IN 
  });
}

/**
 * 生成 refresh token
 */
export function generateRefreshToken(payload: JwtPayload): string {
  return jwt.sign({ ...payload, type: 'refresh' }, REFRESH_TOKEN_SECRET, { 
    expiresIn: REFRESH_TOKEN_EXPIRES_IN 
  });
}

/**
 * 生成 token 对（access token + refresh token）
 */
export function generateTokenPair(payload: JwtPayload): TokenPair {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
}

/**
 * 验证 access token
 */
export function verifyAccessToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch (error) {
    throw new Error('无效的access token');
  }
}

/**
 * 验证 refresh token
 */
export function verifyRefreshToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, REFRESH_TOKEN_SECRET) as JwtPayload;
  } catch (error) {
    throw new Error('无效的refresh token');
  }
}

/**
 * 兼容旧版本的 generateToken 和 verifyToken
 */
export function generateToken(payload: JwtPayload): string {
  return generateAccessToken(payload);
}

export function verifyToken(token: string): JwtPayload {
  return verifyAccessToken(token);
}

