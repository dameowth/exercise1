import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'X7kP9mQ2vL5jR8tY3uW4eH6nB1cD0fG9aS3rT2wQ8vL5jX7k';
const payload = {
  id: 123,
  username: 'adminUser',
  email: 'admin@example.com',
  iat: Math.floor(Date.now() / 1000)
};

const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
console.log('Generated Token:', token);