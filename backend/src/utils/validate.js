const HttpError = require('./httpError');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isEmpty = (x) => x === undefined || x === null || x === '';

function uuid(value, name = 'id') {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new HttpError(400, `${name} must be a valid id`);
  }
  return value;
}

function number(value, name, { min = -Infinity, max = Infinity, required = true } = {}) {
  if (isEmpty(value)) {
    if (required) throw new HttpError(400, `${name} is required`);
    return undefined;
  }
  const n = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) {
    const range = Number.isFinite(min) && Number.isFinite(max) ? ` between ${min} and ${max}`
      : Number.isFinite(min) ? ` of at least ${min}`
      : Number.isFinite(max) ? ` of at most ${max}` : '';
    throw new HttpError(400, `${name} must be a number${range}`);
  }
  return n;
}

function integer(value, name, { min = -Infinity, max = Infinity, fallback } = {}) {
  if (isEmpty(value)) return fallback;
  const n = number(value, name, { min, max });
  if (!Number.isInteger(n)) throw new HttpError(400, `${name} must be a whole number`);
  return n;
}

const lat = (value, name = 'lat', opts = {}) => number(value, name, { min: -90, max: 90, ...opts });
const lng = (value, name = 'lng', opts = {}) => number(value, name, { min: -180, max: 180, ...opts });

function text(value, name, { max = 255, required = true } = {}) {
  if (isEmpty(value)) {
    if (required) throw new HttpError(400, `${name} is required`);
    return undefined;
  }
  if (typeof value !== 'string') throw new HttpError(400, `${name} must be text`);
  const t = value.trim();
  if (!t) {
    if (required) throw new HttpError(400, `${name} is required`);
    return undefined;
  }
  if (t.length > max) throw new HttpError(400, `${name} must be at most ${max} characters`);
  return t;
}

function oneOf(value, name, list, fallback) {
  if (isEmpty(value)) return fallback;
  if (!list.includes(value)) throw new HttpError(400, `${name} must be one of: ${list.join(', ')}`);
  return value;
}

function isoDate(value, name, { required = true } = {}) {
  if (isEmpty(value)) {
    if (required) throw new HttpError(400, `${name} is required`);
    return undefined;
  }
  const d = typeof value === 'string' ? new Date(value) : new Date(NaN);
  if (Number.isNaN(d.getTime())) {
    throw new HttpError(400, `${name} must be an ISO date-time like 2026-11-16T09:30:00Z`);
  }
  return d;
}

module.exports = { uuid, number, integer, lat, lng, text, oneOf, isoDate };
