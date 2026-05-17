import * as SQLite from 'expo-sqlite';

// 1. Open the offline database (creates it if it doesn't exist)
const db = SQLite.openDatabaseSync('cbdc_ledger.db');

// ── Database Initialization ─────────────────────────────────────
export const initLedger = async () => {
  try {
    // WAL mode makes writes incredibly fast for instant offline payments
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,       -- 'sent' or 'received'
        name TEXT NOT NULL,       -- Counterparty name
        amount REAL NOT NULL,
        time TEXT NOT NULL,
        mode TEXT NOT NULL,       -- 'QR' or 'NFC'
        status TEXT NOT NULL,     -- 'confirmed', 'pending', 'failed', 'synced'
        note TEXT,
        raw_signature TEXT        -- To prove cryptographic validity later to the RBI/Server
      );
    `);
    console.log('✅ SQLite Master Ledger initialized.');
  } catch (error) {
    console.error('❌ Failed to initialize SQLite Ledger:', error);
  }
};

// ── Ledger Operations ───────────────────────────────────────────
export const getTransactions = async () => {
  try {
    // Fetch all transactions ordered by newest first
    return await db.getAllAsync('SELECT * FROM transactions ORDER BY rowid DESC');
  } catch (error) {
    console.error('❌ Failed to fetch transactions:', error);
    return [];
  }
};

export const insertTransaction = async (txn) => {
  try {
    await db.runAsync(
      `INSERT INTO transactions (id, type, name, amount, time, mode, status, note, raw_signature) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        txn.id, 
        txn.type, 
        txn.name, 
        txn.amount, 
        txn.time, 
        txn.mode, 
        txn.status, 
        txn.note || '',
        txn.raw_signature || ''
      ]
    );
    console.log(`✅ Transaction ${txn.id} securely written to offline ledger.`);
    return true;
  } catch (error) {
    console.error('❌ Failed to insert transaction:', error);
    return false;
  }
};

export const getBalance = async () => {
  try {
    // Calculate exact balance dynamically: (Received) - (Sent)
    const received = await db.getFirstAsync(`SELECT SUM(amount) as total FROM transactions WHERE type = 'received'`);
    const sent = await db.getFirstAsync(`SELECT SUM(amount) as total FROM transactions WHERE type = 'sent'`);
    
    const totalReceived = received?.total || 0;
    const totalSent = sent?.total || 0;
    
    // We add a default 5000 just so you have testing money in the prototype phase
    return (5000 + totalReceived) - totalSent; 
  } catch (error) {
    console.error('❌ Failed to calculate balance:', error);
    return 0;
  }
};

// ── Reconciliation Operations ───────────────────────────────────
export const markTransactionsAsSyncedInDB = async (syncedIds) => {
  if (!syncedIds || syncedIds.length === 0) return;
  
  try {
    // Creates a string of question marks for the SQL query: "?, ?, ?"
    const placeholders = syncedIds.map(() => '?').join(','); 
    
    // The SQL command to update the status safely
    const query = `UPDATE transactions SET status = 'synced' WHERE id IN (${placeholders})`;
    
    // Execute the query safely passing the array of IDs to replace the placeholders
    await db.runAsync(query, ...syncedIds); 
    
    console.log(`☁️ Successfully marked ${syncedIds.length} transactions as synced in local SQLite.`);
  } catch (error) {
    console.error('❌ Failed to update synced status:', error);
  }
};