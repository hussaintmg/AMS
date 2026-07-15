const test=require('node:test');const assert=require('node:assert/strict');const {scoreFor,escapeRegex}=require('../controllers/global-search.controller');
test('exact structured values rank highest',()=>{assert.equal(scoreFor('INV-10024',['INV-10024','paid']),.98)});
test('prefix and partial matches rank above weak matches',()=>{assert.ok(scoreFor('har',['Haris Ahmed'])>scoreFor('haris phone',['customer phone']))});
test('multi-word search requires all words for fallback score',()=>{assert.equal(scoreFor('customer haris',['Haris Ahmed']),0);assert.equal(scoreFor('customer haris',['customer Haris']),1)});
test('regex query text is escaped',()=>{assert.equal(escapeRegex('INV.100+24'),'INV\\.100\\+24')});
