import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || '123456789abcdef';
const payload = {
  userId: 'user123',
  role: 'admin',
  iat: Math.floor(Date.now() / 1000)
};

const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
console.log('Generated Token:', token);