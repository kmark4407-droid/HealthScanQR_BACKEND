// index.js - MINIMAL WORKING VERSION FOR RENDER
import express from 'express';
import cors from 'cors';
import 'dotenv/config';

const app = express();

// Basic CORS - SIMPLIFIED
app.use(cors({
  origin: ['https://healthscanqr2025.vercel.app', 'http://localhost:4200'],
  credentials: true
}));

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// SIMPLE HEALTH CHECK - NO COMPLEX ROUTES
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server is running perfectly!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// TEST ROUTE - SIMPLE PATH
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true,
    message: 'API test successful! 🎉' 
  });
});

// SIMPLE CATCH-ALL - NO COMPLEX PARAMETERS
app.get('*', (req, res) => {
  res.json({ 
    message: 'HealthScan QR API Server',
    status: 'Running',
    available_endpoints: ['/api/health', '/api/test']
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/api/health`);
  console.log(`✅ Test endpoint: http://localhost:${PORT}/api/test`);
});
