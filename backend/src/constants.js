module.exports = {
  // Must match the ML model's labels exactly
  CATEGORIES: ['Traffic', 'Road Hazard', 'Accident', 'Construction',
               'Waterlogging', 'Safety Concern', 'Route Tip', 'Normal'],
  SEVERITIES: ['Low', 'Medium', 'High'],
  // Categories counted as "hazard reports" when scoring how safe an area is
  HAZARD_CATEGORIES: ['Accident', 'Road Hazard', 'Safety Concern'],
  HAZARD_RADIUS_METERS: 500,
  KM_TO_MILES: 0.621371,
  DASHBOARD_TIMEZONE: 'Asia/Kolkata',
};
