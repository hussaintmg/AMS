const { pendingList } = require('../utils/mongoPendingResponse');

const listLedger = (req, res) => pendingList(res, 'Ledger');

module.exports = { listLedger };
