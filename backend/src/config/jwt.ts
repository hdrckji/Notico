import jwt from 'jsonwebtoken';

export interface JwtPayload {
  id: string;
  role: 'ADMIN' | 'EMPLOYEE' | 'SUPPLIER';
  email: string;
}

export const generateToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, process.env.JWT_SECRET || 'secret', {
    expiresIn: process.env.JWT_EXPIRY || '7d',
  });
};

export const verifyToken = (token: string): JwtPayload => {
  return jwt.verify(token, process.env.JWT_SECRET || 'secret') as JwtPayload;
};
