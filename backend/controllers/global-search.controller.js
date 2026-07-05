const { pendingList } = require('../utils/mongoPendingResponse');

const search = (req, res) => pendingList(res, 'Global Search');

module.exports = { search };
