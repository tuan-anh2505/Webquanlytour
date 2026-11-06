const express = require('express');
const controller = require('../controllers/siteController');
const { authenticate, authenticateOperations, requireRoles, requirePermission } = require('../middlewares/auth');
const { createRateLimiter } = require('../middlewares/security');

// Guest tiếp tục xem/tìm kiếm nội dung mà không qua xác thực.
const publicRouter = express.Router();
publicRouter.get('/articles', controller.articles);
publicRouter.get('/articles/:id', controller.article);
publicRouter.get('/search', controller.search);
publicRouter.get('/tours/:id/reviews', controller.reviews);

// Mỗi route Customer lấy ID tài khoản từ token; không nhận customer_id từ request.
const customerRouter = express.Router();
/** Chỉ xác thực route Customer đã khớp; không chặn các API Guest đi ngang router. */
function customer(method, path, ...handlers) { customerRouter[method](path, authenticate, requireRoles('customer'), ...handlers); }
customer('get', '/wishlist', controller.wishlist);
customer('get', '/wishlist/:id', controller.wishlistState);
customer('put', '/wishlist/:id', controller.saveWishlist);
customer('delete', '/wishlist/:id', controller.removeWishlist);
customer('get', '/reviews/me', controller.ownReviews);
customer('get', '/tours/:id/review', controller.eligibility);
customer('put', '/tours/:id/review', createRateLimiter({ max: 20, windowMs: 15 * 60000 }), controller.saveReview);
customer('get', '/notifications', controller.notifications);
customer('patch', '/notifications/:id/read', controller.readNotification);
customer('post', '/notifications/read-all', controller.readAll);
customer('get', '/bookings/:id/trip', controller.customerTrip);

const manageRouter = express.Router();
manageRouter.use(authenticateOperations, requireRoles('admin','staff'));
manageRouter.get('/dashboard', requirePermission('dashboard.read'), controller.dashboard);
manageRouter.get('/articles', requirePermission('articles.read'), controller.manageArticles);
manageRouter.get('/articles/:id', requirePermission('articles.read'), controller.manageArticle);
manageRouter.post('/articles', requirePermission('articles.write'), controller.createArticle);
manageRouter.patch('/articles/:id', requirePermission('articles.write'), controller.updateArticle);
manageRouter.get('/guides', requirePermission('guides.read'), controller.guides);
manageRouter.post('/guides', requirePermission('guides.write'), controller.createGuide);
manageRouter.patch('/guides/:id', requirePermission('guides.write'), controller.updateGuide);
manageRouter.get('/trips', requirePermission('trips.read'), controller.trips);
manageRouter.get('/trips/:id', requirePermission('trips.read'), controller.trip);
manageRouter.patch('/trips/:id', requirePermission('trips.write'), controller.updateTrip);
manageRouter.post('/trips/:id/guides', requirePermission('trips.write'), controller.assignGuide);
manageRouter.delete('/trips/:id/guides/:guideId', requirePermission('trips.write'), controller.removeGuide);
manageRouter.post('/trips/:id/complete', requirePermission('trips.write'), requirePermission('bookings.write'), controller.completeTrip);
manageRouter.get('/reviews', requirePermission('reviews.read'), controller.manageReviews);
manageRouter.patch('/reviews/:id', requirePermission('reviews.write'), controller.moderateReview);
manageRouter.get('/notifications', controller.notifications);
manageRouter.patch('/notifications/:id/read', controller.readNotification);
manageRouter.post('/notifications/read-all', controller.readAll);

module.exports = { publicRouter, customerRouter, manageRouter };
