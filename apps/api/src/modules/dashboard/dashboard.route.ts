import { FastifyInstance } from 'fastify';
import { getDashboardStats, getDashboardChart } from './dashboard.controller';
import { authenticate } from '../../middleware/authenticate';

export async function dashboardRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', authenticate);

    fastify.get('/stats', getDashboardStats);
    fastify.get('/chart', getDashboardChart);
}
