const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const {
  validateDateQuery,
  validateAppointmentCreate,
  validateAppointmentIdentifier,
} = require('../middleware/validator');

// GET /api/appointments/availability?date=YYYY-MM-DD
router.get('/availability', validateDateQuery, appointmentController.getAvailability);

// POST /api/appointments
router.post('/', validateAppointmentCreate, appointmentController.createAppointment);

// GET /api/appointments/:id
router.get('/:id', validateAppointmentIdentifier, appointmentController.getAppointment);

module.exports = router;

