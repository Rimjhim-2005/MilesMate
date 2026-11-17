const express = require('express');
const cors = require('cors');
const HttpError = require('./utils/httpError');

const app = express();
app.use(cors());
app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/users.routes'));
app.use('/api/forum', require('./routes/forum.routes'));
app.use('/api/trips', require('./routes/trips.routes'));
app.use('/api/group-rides', require('./routes/groupRides.routes'));
app.use('/api/dashboard', require('./routes/dashboard.routes'));

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// Central error handler: every error becomes { "error": "message" }
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON' });
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
