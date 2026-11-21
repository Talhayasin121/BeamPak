import {getDatabase} from '@netlify/database';
import {handleOrders} from '../../server/orders.js';

let database;
function query(sql, parameters) {
  if (!database) {
    database = getDatabase();
    database.pool.on('error', failure => console.error('Order database connection failed:', failure.name));
  }
  return database.sql.unsafe(sql, parameters);
}

export default function orders(request) {
  return handleOrders(request, query, process.env.BEAMPAK_ADMIN_KEY);
}

export const config = {
  path: ['/api/health', '/api/orders', '/api/orders/lookup', '/api/manage/orders', '/api/manage/status', '/api/interest', '/api/manage/interest', '/api/order-confirmations', '/api/manage/order-confirmations', '/api/activity', '/api/manage/activity']
};
