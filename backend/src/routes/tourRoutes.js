const express = require('express');
const controller = require('../controllers/tourController');
const { authenticateOperations, requireRoles, requirePermission } = require('../middlewares/auth');

// Các route Guest được gắn tại /api và hoàn toàn không đi qua authenticate.
const publicRouter = express.Router();
publicRouter.get('/company', controller.company);
publicRouter.get('/categories', controller.categories);
publicRouter.get('/tours', controller.listPublic);
publicRouter.get('/tours/:idOrSlug/schedules', controller.schedulesPublic);
publicRouter.get('/tours/:idOrSlug', controller.detailPublic);

// Các route quản trị được gắn tại /api/manage; quyền được kiểm tra ở backend từng thao tác.
const manageRouter = express.Router();
manageRouter.use(authenticateOperations, requireRoles('admin', 'staff'));
manageRouter.get('/categories', requirePermission('categories.read'), controller.categories);
manageRouter.post('/categories', requirePermission('categories.write'), controller.createCategory);
manageRouter.patch('/categories/:id', requirePermission('categories.write'), controller.updateCategory);
manageRouter.get('/tours', requirePermission('tours.read'), controller.listManage);
manageRouter.post('/tours', requirePermission('tours.write'), controller.createTour);
manageRouter.get('/tours/:id', requirePermission('tours.read'), controller.detailManage);
manageRouter.patch('/tours/:id', requirePermission('tours.write'), controller.updateTour);
manageRouter.post('/tours/:id/images', requirePermission('tours.write'), controller.createImage);
manageRouter.patch('/tours/:id/images/:imageId', requirePermission('tours.write'), controller.updateImage);
manageRouter.post('/tours/:id/itineraries', requirePermission('tours.write'), controller.createItinerary);
manageRouter.patch('/tours/:id/itineraries/:itineraryId', requirePermission('tours.write'), controller.updateItinerary);
manageRouter.get('/tours/:id/schedules', requirePermission('schedules.read'), controller.schedulesManage);
manageRouter.post('/tours/:id/schedules', requirePermission('schedules.write'), controller.createSchedule);
manageRouter.patch('/tours/:id/schedules/:scheduleId', requirePermission('schedules.write'), controller.updateSchedule);

module.exports = { publicRouter, manageRouter };
