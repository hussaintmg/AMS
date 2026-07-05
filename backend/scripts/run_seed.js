const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const runSeed = async () => {
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

        const seedFile = path.join(__dirname, '../../database/clean_and_seed_vehicles.sql');
        console.log(`Reading SQL from ${seedFile}...`);

        const sql = fs.readFileSync(seedFile, 'utf8');

        console.log('Executing SQL...');
        await connection.query(sql);

        console.log('Seed data imported successfully!');
        await connection.end();
        process.exit(0);
    } catch (error) {
        console.error('Error running seed:', error);
        process.exit(1);
    }
};

runSeed();
