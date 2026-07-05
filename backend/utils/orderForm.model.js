const db = require('../config/database');

const OrderForm = {
    /**
     * Bulk insert parsed order forms into database
     * @param {Array} records 
     */
    bulkInsert: async (records) => {
        if (!records || records.length === 0) return 0;

        const connection = await db.pool.getConnection();
        try {
            await connection.beginTransaction();

            let insertedCount = 0;

            for (const record of records) {
                // Determine if we need to insert or ignore (based on unique order_no constraint)
                const query = `
                    INSERT IGNORE INTO order_forms (
                        s_no, order_no, ref_no, order_date, applicant, 
                        variant, color, inst_no, ex_factory_price, 
                        freight_charges, msrp, on_booking, balance_payments, 
                        remaining_balance, type, bank, delivery_month
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;

                const values = [
                    record.s_no, record.order_no, record.ref_no, record.order_date, record.applicant,
                    record.variant, record.color, record.inst_no, record.ex_factory_price,
                    record.freight_charges, record.msrp, record.on_booking, record.balance_payments,
                    record.remaining_balance, record.type, record.bank, record.delivery_month
                ];

                const [result] = await connection.execute(query, values);
                if (result.affectedRows > 0) {
                    insertedCount++;
                }
            }

            await connection.commit();
            return insertedCount;

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
};

module.exports = OrderForm;
