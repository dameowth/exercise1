import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'X7kP9mQ2vL5jR8tY3uW4eH6nB1cD0fG9aS3rT2wQ8vL5jX7k';
const payload = {
  userId: 'user123',
  role: 'admin',
  iat: Math.floor(Date.now() / 1000)
};

const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
console.log('Generated Token:', token);