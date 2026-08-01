const mongoose = require('mongoose');
const logger = require('../../utils/logger');
const { importTrace } = require('./importDebugAudit');

class MutationJournal {
  constructor() {
    this.entries = [];
  }

  trackCreate(model, id) {
    if (model && id) this.entries.push({ kind: 'create', model, id });
  }

  trackUpdate(model, before) {
    if (model && before?._id) this.entries.push({ kind: 'update', model, before });
  }

  async compensate() {
    for (const entry of [...this.entries].reverse()) {
      if (entry.kind === 'create') {
        await entry.model.deleteOne({ _id: entry.id });
      } else if (entry.kind === 'update') {
        await entry.model.collection.replaceOne({ _id: entry.before._id }, entry.before, { upsert: true });
      }
    }
  }
}

async function supportsTransactions() {
  try {
    if (mongoose.connection.readyState !== 1) return false;
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    return Boolean(hello.setName || hello.msg === 'isdbgrid');
  } catch (error) {
    logger.warn(`Unable to determine MongoDB transaction support: ${error.message}`);
    return false;
  }
}

async function runAtomicRow(work, { useTransactions = false } = {}) {
  const journal = new MutationJournal();
  if (useTransactions) {
    const session = await mongoose.startSession();
    importTrace("[TRANSACTION_START]", {
      sessionId: session.id,
    });
    try {
      session.startTransaction();
      const result = await work({ session, journal });
      importTrace("[TRANSACTION_COMMIT_ATTEMPT]");
      await session.commitTransaction();
      importTrace("[TRANSACTION_COMMIT_SUCCESS]");
      return result;
    } catch (error) {
      console.error("[TRANSACTION_ABORT]", {
        reason: error.message,
        stack: error.stack,
      });
      if (session.inTransaction()) await session.abortTransaction().catch(() => {});
      throw error;
    } finally {
      await session.endSession();
    }
  }

  importTrace("[TRANSACTION_NOT_USED]", {
    mode: "compensating_rollback",
  });
  try {
    return await work({ session: null, journal });
  } catch (error) {
    try {
      await journal.compensate();
    } catch (rollbackError) {
      error.rollbackError = rollbackError;
      logger.error(`Import compensation failed: ${rollbackError.message}`);
    }
    throw error;
  }
}

module.exports = { MutationJournal, runAtomicRow, supportsTransactions };
