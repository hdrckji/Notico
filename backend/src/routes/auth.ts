import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { prisma } from '../config/database';
import { generateToken } from '../config/jwt';

const router = Router();

// ============ SUPPLIER LOGIN ============
router.post('/supplier/login', [
  body('email').notEmpty(),
  body('password').notEmpty(),
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { email, password } = req.body;
    
    // In a real app, suppliers would be authenticated differently
    // This is a placeholder - adjust based on your supplier auth method
    const supplier = await prisma.supplier.findUnique({ where: { email } });
    
    if (!supplier) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken({
      id: supplier.id,
      role: 'SUPPLIER',
      email: supplier.email,
    });

    res.json({ token, supplier: { id: supplier.id, name: supplier.name, email: supplier.email } });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// ============ INTERNAL USER LOGIN ============
router.post('/internal/login', [
  body('identifier').optional().notEmpty(),
  body('email').optional().notEmpty(),
  body('password').notEmpty(),
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const identifier = req.body.identifier || req.body.email;
    const { password } = req.body;

    if (!identifier) {
      return res.status(400).json({ error: 'Identifier is required' });
    }

    const user = await prisma.internalUser.findUnique({ where: { email: identifier } });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken({
      id: user.id,
      role: user.role,
      email: user.email,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        locationId: user.locationId,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

export default router;
