/**
 * Customer Repository - Specialized Customer Operations
 * Maintained by Hussain Developer
 * AMS ERP
 */

const BaseRepository = require('./BaseRepository');
const { query } = require('../config/database');

class CustomerRepository extends BaseRepository {
    constructor() {
        super('customers', 'id');
    }

    /**
     * Get customers with purchase history
     */
    async findAllWithPurchases(options = {}) {
        const { page = 1, limit = 20, type = null } = options;

        let sql = `
            SELECT c.*,
                   COUNT(DISTINCT so.id) as total_purchases,
                   COALESCE(SUM(so.total_amount), 0) as total_spent,
                   MAX(so.created_at) as last_purchase_date
            FROM customers c
            LEFT JOIN sales_orders so ON c.id = so.customer_id
            WHERE 1=1
        `;
        const params = [];

        if (type) {
            sql += ' AND c.customer_type = ?';
            params.push(type);
        }

        sql += ' GROUP BY c.id';

        // Count total
        const [countResult] = await query(`SELECT COUNT(*) as total FROM customers WHERE 1=1${type ? ' AND customer_type = ?' : ''}`, type ? [type] : []);
        const total = countResult.total;

        // Add pagination
        sql += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

        const results = await query(sql, params);

        return {
            data: results,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit)
            }
        };
    }

    /**
     * Get customer lifetime value
     */
    async getLifetimeValue(customerId) {
        const sql = `
            SELECT 
                c.*,
                COUNT(DISTINCT so.id) as total_orders,
                COALESCE(SUM(so.total_amount), 0) as lifetime_value,
                COALESCE(AVG(so.total_amount), 0) as average_order_value,
                MIN(so.created_at) as first_purchase,
                MAX(so.created_at) as last_purchase
            FROM customers c
            LEFT JOIN sales_orders so ON c.id = so.customer_id
            WHERE c.id = ?
            GROUP BY c.id
        `;

        const results = await query(sql, [customerId]);
        return results[0] || null;
    }

    /**
     * Search customers
     */
    async searchCustomers(searchTerm, options = {}) {
        return this.search(
            ['first_name', 'last_name', 'email', 'phone', 'customer_number'],
            searchTerm,
            options
        );
    }
}

module.exports = CustomerRepository;
