import { Router } from 'express';
import authRoutes from './auth.routes';
import usersRoutes from './users.routes';
import providersRoutes from './providers.routes';
import bookingsRoutes from './bookings.routes';
import reviewsRoutes from './reviews.routes';
import messagesRoutes from './messages.routes';
import budgetRoutes from './budget.routes';
import notificationsRoutes from './notifications.routes';
import paymentsRoutes from './payments.routes';
import emergencyRoutes from './emergency.routes';
import recommendationsRoutes from './recommendations.routes';
import adminRoutes from './admin.routes';
import reportsRoutes from './reports.routes';
import walletRoutes from './wallet.routes';
import healthRoutes from './health.routes';

export const router = Router();

router.use('/health', healthRoutes);
router.use('/admin', adminRoutes);
router.use('/reports', reportsRoutes);
router.use('/wallet', walletRoutes);

router.use('/auth',          authRoutes);
router.use('/users',         usersRoutes);
router.use('/providers',     providersRoutes);
router.use('/bookings',      bookingsRoutes);
router.use('/reviews',       reviewsRoutes);
router.use('/messages',      messagesRoutes);
router.use('/budget',        budgetRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/payments',      paymentsRoutes);
router.use('/emergency',     emergencyRoutes);
router.use('/recommendations', recommendationsRoutes);
