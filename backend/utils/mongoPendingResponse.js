/**
 * Safe placeholder responses for non-migrated SQL modules.
 * Returns empty data so frontend does not crash
 * while MongoDB migration continues.
 */

function pendingList(res, moduleName) {
  return res.json({
    success: true,
    data: [],
    message: `${moduleName} is pending MongoDB migration`
  });
}

function pendingObject(res, moduleName) {
  return res.json({
    success: true,
    data: {},
    message: `${moduleName} is pending MongoDB migration`
  });
}

function pendingStats(res, moduleName) {
  return res.json({
    success: true,
    data: {},
    message: `${moduleName} is pending MongoDB migration`
  });
}

module.exports = {
  pendingList,
  pendingObject,
  pendingStats
};
