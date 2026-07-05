/**
 * Lead Repository - Specialized Lead Operations with Advanced Filtering
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * info@logixinventor.com +92 333 3836851
 * www.logixinventor.com | AMS
 */

const BaseRepository = require('./BaseRepository');
const { query } = require('../config/database');

class LeadRepository extends BaseRepository {
    constructor() {
        super('leads', 'id');
    }

    /**
     * Get leads with advanced filtering, search, and pagination
     * @param {Object} options - Filter options
     */
    async findAllWithFilters(options = {}) {
        try {
            const {
                search = '',
                status = '',
                source_id = null,
                priority = '',
                city = '',
                assigned_to = null,
                date_from = null,
                date_to = null,
                page = 1,
                limit = 20,
                sort_by = 'created_at',
                sort_order = 'desc'
            } = options;

            // Using professional stored procedure for filtering
            const results = await query(
                'CALL sp_filter_leads_advanced(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    search || null,
                    status || null,
                    source_id || null,
                    priority || null,
                    city || null,
                    assigned_to || null,
                    date_from || null,
                    date_to || null,
                    parseInt(page),
                    parseInt(limit),
                    sort_by || 'created_at',
                    sort_order || 'DESC'
                ]
            );

            const leads = results[0] || [];
            const totalCount = (results[1] && results[1][0]) ? results[1][0].total_count : leads.length;

            return {
                data: leads,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: totalCount,
                    totalPages: Math.ceil(totalCount / parseInt(limit))
                }
            };
        } catch (error) {
            console.error('LeadRepository.findAllWithFilters error:', error);
            throw error;
        }
    }

    /**
     * Create a new lead using professional stored procedure
     */
    async create(data) {
        try {
            await query(
                `CALL sp_create_lead(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, @p_lead_id, @p_lead_num)`,
                [
                    data.first_name,
                    data.last_name,
                    data.email || null,
                    data.phone,
                    data.alternate_phone || null,
                    data.address || null,
                    data.city || null,
                    data.state || null,
                    data.postal_code || null,
                    data.source_id || null,
                    data.status || 'new',
                    data.priority || 'medium',
                    data.interested_in || null,
                    data.budget_range || null,
                    data.notes || null,
                    data.assigned_to || null,
                    data.created_by
                ]
            );

            const outputRows = await query('SELECT @p_lead_id as leadId, @p_lead_num as leadNumber');
            const outputRow = Array.isArray(outputRows) ? outputRows[0] : outputRows;
            return {
                id: outputRow?.leadId || null,
                lead_number: outputRow?.leadNumber || null
            };
        } catch (error) {
            console.error('LeadRepository.create error:', error);
            throw error;
        }
    }

    /**
     * Update lead using professional stored procedure
     */
    async update(id, data) {
        try {
            await query(
                `CALL sp_update_lead(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id,
                    data.first_name,
                    data.last_name,
                    data.email || null,
                    data.phone,
                    data.alternate_phone || null,
                    data.address || null,
                    data.city || null,
                    data.state || null,
                    data.postal_code || null,
                    data.source_id || null,
                    data.status,
                    data.priority,
                    data.interested_in || null,
                    data.budget_range || null,
                    data.notes || null,
                    data.assigned_to || null,
                    data.updated_by || data.created_by // assuming user id passed
                ]
            );
            return true;
        } catch (error) {
            console.error('LeadRepository.update error:', error);
            throw error;
        }
    }

    /**
     * Delete lead using professional stored procedure
     */
    async delete(id, deletedBy) {
        try {
            await query('CALL sp_delete_lead(?, ?)', [id, deletedBy || 1]);
            return true;
        } catch (error) {
            console.error('LeadRepository.delete error:', error);
            throw error;
        }
    }

    /**
     * Convert lead to customer using professional stored procedure
     */
    async convertToCustomer(leadId, userId) {
        try {
            const [result] = await query('CALL sp_convert_lead_to_opportunity(?, ?)', [leadId, userId]);
            return result[0];
        } catch (error) {
            console.error('LeadRepository.convertToCustomer error:', error);
            throw error;
        }
    }


    async findAllWithDetails(options = {}) {
        return this.findAllWithFilters(options);
    }

    async search(fields, searchTerm, options = {}) {
        return this.findAllWithFilters({
            ...options,
            search: searchTerm
        });
    }

    async getLeadSources() {
        const sql = `SELECT id, name, description FROM lead_sources WHERE is_active = 1 ORDER BY name`;
        return await query(sql);
    }

    async getFilterOptions() {
        try {
            const results = await query('CALL sp_get_lead_filter_options()');
            return {
                statuses: results[0] || [],
                priorities: results[1] || [],
                sources: results[2] || [],
                cities: results[3] || [],
                assignedUsers: results[4] || []
            };
        } catch (error) {
            console.error('LeadRepository.getFilterOptions error:', error);
            // Fallback to manual queries if SP fails (backward compatibility)
            const statuses = await query(`SELECT DISTINCT status as value, status as label FROM leads`);
            const priorities = await query(`SELECT DISTINCT priority as value, priority as label FROM leads`);
            return { statuses, priorities, sources: [], cities: [], assignedUsers: [] };
        }
    }

    async getAnalytics() {
        try {
            const results = await query('CALL sp_get_lead_analytics()');
            return {
                overall: results[0] && results[0][0],
                statusDistribution: results[1] || [],
                sourceDistribution: results[2] || [],
                trend: results[3] || []
            };
        } catch (error) {
            console.error('LeadRepository.getAnalytics error:', error);
            throw error;
        }
    }

    async getPipelineStats() {
        const stats = await this.getAnalytics();
        return stats.statusDistribution;
    }

    async getSourceDistribution() {
        const stats = await this.getAnalytics();
        return stats.sourceDistribution;
    }

    async exportLeads(filters = {}) {
        const result = await this.findAllWithFilters({
            ...filters,
            page: 1,
            limit: 10000
        });
        return result.data;
    }

    async getTodayFollowUps(userId = null) {
        let sql = `
            SELECT l.*, 
                   CONCAT(u.first_name, ' ', u.last_name) as assigned_to_name
            FROM leads l
            LEFT JOIN users u ON l.assigned_to = u.id
            WHERE DATE(l.next_follow_up) = CURDATE()
        `;
        const params = [];

        if (userId) {
            sql += ' AND l.assigned_to = ?';
            params.push(userId);
        }

        sql += ' ORDER BY l.next_follow_up ASC';
        return await query(sql, params);
    }
}

module.exports = LeadRepository;
