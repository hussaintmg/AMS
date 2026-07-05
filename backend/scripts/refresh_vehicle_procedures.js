const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const runProcedures = async () => {
    try {
        console.log('Connecting to database...');
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'ams_db',
            multipleStatements: true
        });

        console.log('Connected.');

        // Define paths to procedure files
        const proceduresFile = path.join(__dirname, '../../database/vehicle_inventory_procedures.sql');

        console.log(`Reading SQL from ${proceduresFile}...`);
        let sql = fs.readFileSync(proceduresFile, 'utf8');

        // Remove DELIMITER commands
        sql = sql.replace(/DELIMITER \/\/|DELIMITER ;/g, '');

        // Split by //
        const statements = sql.split('//').map(s => s.trim()).filter(s => s.length > 0);

        console.log(`Found ${statements.length} statements.`);

        for (const statement of statements) {
            try {
                // Ensure we don't execute empty or just comments
                if (statement.length > 10) {
                    await connection.query(statement);
                }
            } catch (err) {
                console.error('Error executing statement:', err.sqlMessage || err.message);
                // Continue to next statement
            }
        }

        console.log('Procedures refreshed successfully!');
        await connection.end();
        process.exit(0);
    } catch (error) {
        console.error('Error refreshing procedures:', error);
        process.exit(1);
    }
};

runProcedures();
