import jwt, { Secret, SignOptions } from 'jsonwebtoken';

export interface JwtPayload {
  id: string;
  role: 'ADMIN' | 'EMPLOYEE' | 'SUPPLIER';
  email: string;
  locationId?: string | null;
}

export const generateToken = (payload: JwtPayload): string => {
  const secret: Secret = process.env.JWT_SECRET || 'secret';
  const options: SignOptions = {
    expiresIn: (process.env.JWT_EXPIRY || '7d') as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, secret, options);
};

export const verifyToken = (token: string): JwtPayload => {
  const secret: Secret = process.env.JWT_SECRET || 'secret';
  return jwt.verify(token, secret) as JwtPayload;
};
