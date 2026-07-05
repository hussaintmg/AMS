/**
 * Base Repository - Generic CRUD Operations
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * www.logixinventor.com | AMS
 */

const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

class BaseRepository {
    constructor(tableName, primaryKey = 'id') {
        this.tableName = tableName;
        this.primaryKey = primaryKey;
    }

    /**
     * Find all records with pagination, filtering, and sorting
     */
    async findAll(options = {}) {
        const {
            page = 1,
            limit = 20,
            sortBy = 'created_at',
            sortOrder = 'DESC',
            filters = {}
        } = options;

        let sql = `SELECT * FROM ${this.tableName} WHERE 1=1`;
        const params = [];

        // Apply filters
        for (const [key, value] of Object.entries(filters)) {
            if (value !== undefined && value !== null) {
                sql += ` AND ${key} = ?`;
                params.push(value);
            }
        }

        // Count total for pagination
        const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
        const [countResult] = await query(countSql, params);
        const total = countResult.total;

        // Apply sorting and pagination
        sql += ` ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;
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
     * Find single record by ID
     */
    async findById(id) {
        const results = await query(
            `SELECT * FROM ${this.tableName} WHERE ${this.primaryKey} = ?`,
            [id]
        );

        if (results.length === 0) {
            throw new AppError(`${this.tableName} not found`, 404);
        }

        return results[0];
    }

    /**
     * Find records by condition
     */
    async findWhere(conditions = {}) {
        let sql = `SELECT * FROM ${this.tableName} WHERE 1=1`;
        const params = [];

        for (const [key, value] of Object.entries(conditions)) {
            sql += ` AND ${key} = ?`;
            params.push(value);
        }

        return await query(sql, params);
    }

    /**
     * Create new record
     */
    async create(data) {
        const keys = Object.keys(data);
        const values = Object.values(data);
        const placeholders = keys.map(() => '?').join(', ');

        const sql = `INSERT INTO ${this.tableName} (${keys.join(', ')}) VALUES (${placeholders})`;
        const result = await query(sql, values);

        return { id: result.insertId };
    }

    /**
     * Update record by ID
     */
    async update(id, data) {
        const keys = Object.keys(data);
        const values = Object.values(data);

        const setClause = keys.map(key => `${key} = ?`).join(', ');
        const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE ${this.primaryKey} = ?`;

        await query(sql, [...values, id]);
        return { success: true };
    }

    /**
     * Delete record by ID
     */
    async delete(id) {
        await query(
            `DELETE FROM ${this.tableName} WHERE ${this.primaryKey} = ?`,
            [id]
        );
        return { success: true };
    }

    /**
     * Bulk insert
     */
    async bulkInsert(records) {
        if (records.length === 0) return { count: 0 };

        const keys = Object.keys(records[0]);
        const placeholders = records.map(() =>
            `(${keys.map(() => '?').join(', ')})`
        ).join(', ');

        const values = records.flatMap(record => Object.values(record));
        const sql = `INSERT INTO ${this.tableName} (${keys.join(', ')}) VALUES ${placeholders}`;

        await query(sql, values);
        return { count: records.length };
    }

    /**
     * Search with LIKE
     */
    async search(searchFields, searchTerm, options = {}) {
        const { page = 1, limit = 20 } = options;

        const conditions = searchFields.map(field => `${field} LIKE ?`).join(' OR ');
        const searchPattern = `%${searchTerm}%`;
        const params = searchFields.map(() => searchPattern);

        let sql = `SELECT * FROM ${this.tableName} WHERE ${conditions}`;

        // Count total
        const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
        const [countResult] = await query(countSql, params);
        const total = countResult.total;

        // Add pagination
        sql += ` LIMIT ? OFFSET ?`;
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
}

module.exports = BaseRepository;
